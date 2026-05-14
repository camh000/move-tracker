import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/dexie";
import { runSync } from "@/lib/db/sync";
import { installMockSupabase, type MockState } from "@/test/factories/supabase";
import { makeBox, makePhoto, makeOutboxEntry, resetIdCounter } from "@/test/factories/rows";

let state: MockState;

beforeEach(() => {
  resetIdCounter();
  state = installMockSupabase({ user: { id: "test-user-id" } });
});


describe("drainOutbox > resilience (issue #9)", () => {
  it("does not halt the queue when one entry fails — entries 2 and 3 still process", async () => {
    const a = makeBox({ id: "box-a", number: 101, _dirty: 1 });
    const b = makeBox({ id: "box-b", number: 102, _dirty: 1 });
    const c = makeBox({ id: "box-c", number: 103, _dirty: 1 });

    await db().boxes.bulkAdd([a, b, c]);
    await db().outbox.add(makeOutboxEntry({ table: "boxes", op: "insert", row_id: "box-a" }));
    await db().outbox.add(makeOutboxEntry({ table: "boxes", op: "insert", row_id: "box-b" }));
    await db().outbox.add(makeOutboxEntry({ table: "boxes", op: "insert", row_id: "box-c" }));

    state.failures.push({
      table: "boxes",
      op: "insert",
      times: 1,
      error: { code: "42P01", message: "relation \"public.nope\" does not exist" },
    });

    await expect(runSync()).resolves.toBeDefined();

    const bRow = await db().boxes.get("box-b");
    const cRow = await db().boxes.get("box-c");
    expect(bRow?._dirty).toBe(0);
    expect(cRow?._dirty).toBe(0);

    const remaining = await db().outbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].row_id).toBe("box-a");
    expect(remaining[0].attempts).toBe(1);
    expect(remaining[0].last_error).toMatch(/relation/i);
  });

  it("re-attempts the failed entry on subsequent runSync without reprocessing peers", async () => {
    await db().boxes.bulkAdd([
      makeBox({ id: "box-a", number: 201, _dirty: 1 }),
      makeBox({ id: "box-b", number: 202, _dirty: 1 }),
    ]);
    await db().outbox.add(makeOutboxEntry({ table: "boxes", op: "insert", row_id: "box-a" }));
    await db().outbox.add(makeOutboxEntry({ table: "boxes", op: "insert", row_id: "box-b" }));

    state.failures.push(
      { table: "boxes", op: "insert", rowId: "box-a", times: 1, error: { code: "42P01", message: "first" } },
      { table: "boxes", op: "insert", rowId: "box-a", times: 1, error: { code: "42P01", message: "second" } },
    );

    await runSync();
    await runSync();

    const insertedB = state.inserts.boxes.filter((r) => r.id === "box-b");
    expect(insertedB).toHaveLength(1);

    const remaining = await db().outbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].row_id).toBe("box-a");
    expect(remaining[0].attempts).toBe(2);
  });
});

describe("processEntry > boxes insert", () => {
  it("renumbers on 23505 collision and dispatches box-renumbered event", async () => {
    state.tables.boxes.push({
      id: "box-server",
      number: 7,
      destination_room: "Kitchen",
      notes: null,
      sealed: false,
      created_by: "other-user",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const local = makeBox({ id: "box-local", number: 7, _dirty: 1 });
    await db().boxes.add(local);
    await db().outbox.add(makeOutboxEntry({ table: "boxes", op: "insert", row_id: "box-local" }));

    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener("box-renumbered", listener);

    await runSync();

    window.removeEventListener("box-renumbered", listener);

    const renumbered = await db().boxes.get("box-local");
    expect(renumbered?.number).toBe(8);
    expect(renumbered?._dirty).toBe(0);

    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({ from: 7, to: 8, id: "box-local" });

    expect(state.inserts.boxes.some((r) => r.id === "box-local" && r.number === 8)).toBe(true);
  });
});

describe("processEntry > item_photos upload_blob", () => {
  it("uploads blob to storage and clears _local_blob after success", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const photo = makePhoto({
      id: "photo-1",
      item_id: "item-1",
      _local_blob: blob,
      _dirty: 1,
    });
    await db().item_photos.add(photo);
    await db().outbox.add(
      makeOutboxEntry({ table: "item_photos", op: "upload_blob", row_id: "photo-1" }),
    );

    await runSync();

    const expectedPath = `test-user-id/item-1/photo-1.jpg`;
    expect(state.storage.uploaded.has(expectedPath)).toBe(true);

    const afterUpload = await db().item_photos.get("photo-1");
    expect(afterUpload?._local_blob).toBeFalsy();
    expect(afterUpload?.storage_path).toBe(expectedPath);
    expect(afterUpload?._dirty).not.toBe(1);
  });
});

describe("reconcileWithServer", () => {
  it("deletes local non-dirty rows missing from the server, preserves _dirty=1 rows", async () => {
    state.tables.boxes.push({
      id: "keep",
      number: 1,
      destination_room: "Kitchen",
      notes: null,
      sealed: false,
      created_by: "test-user-id",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await db().boxes.bulkAdd([
      makeBox({ id: "keep", number: 1, _dirty: 0 }),
      makeBox({ id: "orphan", number: 2, _dirty: 0 }),
      makeBox({ id: "dirty-orphan", number: 3, _dirty: 1 }),
    ]);

    await db().meta.put({ key: "last_reconcile_at", value: 0 });

    await runSync();

    expect(await db().boxes.get("keep")).toBeDefined();
    expect(await db().boxes.get("orphan")).toBeUndefined();
    expect(await db().boxes.get("dirty-orphan")).toBeDefined();
  });
});

describe("primeFromServer (via deltaPull)", () => {
  it("strips server-only search_vector when pulling items", async () => {
    state.tables.items.push({
      id: "i-1",
      box_id: "b-1",
      name: "Kettle",
      description: null,
      created_by: "test-user-id",
      created_at: new Date().toISOString(),
      updated_at: new Date(Date.now() + 60_000).toISOString(),
      // @ts-expect-error simulating server-only column
      search_vector: "kettle::tsvector",
    });

    await runSync();

    const local = await db().items.get("i-1");
    expect(local).toBeDefined();
    expect(local && (local as unknown as Record<string, unknown>).search_vector).toBeUndefined();
  });
});
