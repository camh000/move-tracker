import { beforeEach, describe, expect, it } from "vitest";
import { env, resetWorld, setOnline, onDevice } from "@/test/setup";
import { db } from "@/lib/db/dexie";
import { runSync, listStuckChanges, discardChange, retryChange } from "@/lib/db/sync";
import { createBox, getBox, listBoxes, updateBox } from "@/lib/repo/boxes";
import { createItem, getItem, moveItem } from "@/lib/repo/items";
import { searchInventory } from "@/lib/repo/search";

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  resetWorld();
  setOnline(true);
});

describe("delta sync between two phones", () => {
  it("pulls a box that was created offline long before it was uploaded", async () => {
    // Phone A goes offline and creates a box.
    onDevice("a");
    await runSync();
    setOnline(false);
    const box = await createBox({ destination_room: "Kitchen" }, "a");

    // Meanwhile phone B syncs a few times (its cursor moves past A's created_at).
    setOnline(true);
    env.server.online = true;
    onDevice("b");
    await runSync();
    env.server.tick(HOUR);
    await createBox({ destination_room: "Loft" }, "b");
    await runSync();

    // A comes back online an hour later and uploads.
    env.server.tick(HOUR);
    onDevice("a");
    await runSync();
    expect(env.server.tables.boxes.map((b) => b.id)).toContain(box.id);

    // B must now see it, even though its created_at is older than B's cursor.
    onDevice("b");
    await runSync();
    const onB = await getBox(box.id);
    expect(onB?.destination_room).toBe("Kitchen");
  });

  it("is not fooled by a phone whose clock is hours off", async () => {
    onDevice("a");
    await runSync();
    const realNow = Date.now;
    Date.now = () => realNow() + 5 * HOUR; // phone A's clock is 5h fast
    try {
      await runSync();
    } finally {
      Date.now = realNow;
    }
    onDevice("b");
    const box = await createBox({ destination_room: "Office" }, "b");
    await runSync();

    onDevice("a");
    await runSync();
    expect((await getBox(box.id))?.destination_room).toBe("Office");
  });

  it("keeps edits to different fields of the same box from both phones", async () => {
    onDevice("a");
    const box = await createBox({ destination_room: "Kitchen" }, "a");
    await runSync();
    onDevice("b");
    await runSync();

    // Both edit offline-ish: A tags it fragile, B writes notes.
    onDevice("a");
    await updateBox(box.id, { fragile: true });
    onDevice("b");
    await updateBox(box.id, { notes: "Glasses" });

    onDevice("a");
    await runSync();
    onDevice("b");
    await runSync();
    onDevice("a");
    await runSync();

    const server = env.server.tables.boxes.find((b) => b.id === box.id)!;
    expect(server.fragile).toBe(true);
    expect(server.notes).toBe("Glasses");
    const onA = await getBox(box.id);
    expect(onA?.fragile).toBe(true);
    expect(onA?.notes).toBe("Glasses");
  });
});

describe("large inventories", () => {
  it("syncs and keeps more than 1000 items (PostgREST page limit)", async () => {
    // Seed the server directly with 2500 items across 50 boxes.
    const stamp = env.server.stamp();
    for (let b = 1; b <= 50; b++) {
      env.server.tables.boxes.push({
        id: `box-${b}`, number: b, destination_room: "Kitchen", notes: null, sealed: false,
        created_by: null, created_at: stamp, updated_at: stamp,
      });
      for (let i = 0; i < 50; i++) {
        env.server.tables.items.push({
          id: `item-${b}-${i}`, box_id: `box-${b}`, name: `Thing ${b}-${i}`, description: null,
          created_by: null, created_at: stamp, updated_at: stamp,
        });
      }
    }
    onDevice("a");
    await runSync();
    expect(await db().items.count()).toBe(2500);

    // Force the periodic reconcile (id-list comparison) to run: it must not
    // delete items beyond the first 1000.
    await db().meta.put({ key: "last_reconcile_at", value: 0 });
    await runSync();
    expect(await db().items.count()).toBe(2500);
    const boxes = await listBoxes();
    expect(boxes.every((b) => b.itemCount === 50)).toBe(true);
  }, 120_000);
});

describe("outbox failures", () => {
  it("a rejected change doesn't block the rest of the queue, and can be discarded", async () => {
    onDevice("a");
    const box = await createBox({ destination_room: "Kitchen" }, "a");
    await runSync();
    onDevice("b");
    await runSync();

    // A adds an item offline; meanwhile B deletes the box.
    onDevice("a");
    setOnline(false);
    const kettle = await createItem({ box_id: box.id, name: "Kettle" }, "a");
    setOnline(true);
    onDevice("b");
    const { deleteBox } = await import("@/lib/repo/boxes");
    await deleteBox(box.id);
    await runSync();

    // A syncs: item insert fails with a foreign-key error…
    onDevice("a");
    const other = await createBox({ destination_room: "Loft" }, "a");
    const res = await runSync();
    expect(res.failed).toBe(1);
    // …but the unrelated box queued after it still went up.
    expect(env.server.tables.boxes.map((b) => b.id)).toContain(other.id);

    const stuck = await listStuckChanges();
    expect(stuck).toHaveLength(1);
    expect(stuck[0].description).toContain("Kettle");
    expect(stuck[0].failed).toBe(true);

    await discardChange(stuck[0].seq);
    expect(await db().outbox.count()).toBe(0);
    expect(await getItem(kettle.id)).toBeUndefined();
    expect(await getBox(box.id)).toBeUndefined();
  });

  it("retries transient errors with backoff and succeeds later", async () => {
    onDevice("a");
    const box = await createBox({ destination_room: "Kitchen" }, "a");
    env.server.failures.push({ table: "boxes", op: "insert", error: { code: "57014", message: "statement timeout" } });
    let res = await runSync();
    expect(res.pending).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.retryError).toMatch(/timeout/);
    const [entry] = await db().outbox.toArray();
    expect(entry.next_attempt_at).toBeGreaterThan(Date.now());

    // A normal sync respects the backoff…
    res = await runSync();
    expect(res.pending).toBe(1);
    // …"Sync now" retries immediately.
    res = await runSync({ ignoreBackoff: true });
    expect(res.pending).toBe(0);
    expect(env.server.tables.boxes.map((b) => b.id)).toContain(box.id);
  });

  it("dropping the connection mid-sync doesn't count as a failure", async () => {
    onDevice("a");
    await createBox({ destination_room: "Kitchen" }, "a");
    env.server.online = false; // navigator still says online (flaky signal)
    await expect(runSync()).rejects.toBeTruthy();
    const [entry] = await db().outbox.toArray();
    expect(entry.attempts).toBe(0);
    expect(entry.failed ?? 0).toBe(0);
    env.server.online = true;
    const res = await runSync();
    expect(res.pending).toBe(0);
  });

  it("an item waits for its box when the box upload is failing", async () => {
    onDevice("a");
    const box = await createBox({ destination_room: "Kitchen" }, "a");
    await createItem({ box_id: box.id, name: "Mug" }, "a");
    env.server.failures.push({ table: "boxes", op: "insert", error: { code: "57014", message: "statement timeout" } });
    await runSync();
    // Item must not have been attempted (it would fail its foreign key).
    const stuck = await listStuckChanges();
    expect(stuck.map((s) => s.description)).toEqual(["Add box 1"]);
    await retryChange(stuck[0].seq);
    const res = await runSync();
    expect(res.pending).toBe(0);
    expect(env.server.tables.items).toHaveLength(1);
  });

  it("renumbers a box when both phones used the same number", async () => {
    onDevice("a");
    await runSync();
    onDevice("b");
    await runSync();
    onDevice("a");
    const a = await createBox({ destination_room: "Kitchen" }, "a");
    onDevice("b");
    const b = await createBox({ destination_room: "Loft" }, "b");
    expect(a.number).toBe(b.number);
    onDevice("a");
    await runSync();
    onDevice("b");
    await runSync();
    const numbers = env.server.tables.boxes.map((x) => x.number).sort();
    expect(numbers).toEqual([1, 2]);
    expect((await getBox(b.id))?.number).toBe(2);
  });
});

describe("moving items and searching", () => {
  it("moves an item to another box and syncs it", async () => {
    onDevice("a");
    const b1 = await createBox({ destination_room: "Kitchen" }, "a");
    const b2 = await createBox({ destination_room: "Loft" }, "a");
    const item = await createItem({ box_id: b1.id, name: "Kettle" }, "a");
    await runSync();
    await moveItem(item.id, b2.id);
    await runSync();
    expect(env.server.tables.items[0].box_id).toBe(b2.id);
    onDevice("b");
    await runSync();
    expect((await getItem(item.id))?.box_id).toBe(b2.id);
  });

  it("search finds partial words, rooms and box numbers", async () => {
    onDevice("a");
    const kitchen = await createBox({ destination_room: "Kitchen", notes: "Mugs and glasses" }, "a");
    await createBox({ destination_room: "Loft" }, "a");
    await createItem({ box_id: kitchen.id, name: "DeLonghi Kettle" }, "a");
    await createItem({ box_id: kitchen.id, name: "Toaster" }, "a");

    expect((await searchInventory("ket")).items.map((h) => h.item.name)).toEqual(["DeLonghi Kettle"]);
    expect((await searchInventory("kitchen toast")).items.map((h) => h.item.name)).toEqual(["Toaster"]);
    expect((await searchInventory("glasses")).items).toHaveLength(2);
    expect((await searchInventory("2")).boxes.map((b) => b.destination_room)).toEqual(["Loft"]);
    expect((await searchInventory("box 1")).boxes.map((b) => b.id)).toEqual([kitchen.id]);
  });
});
