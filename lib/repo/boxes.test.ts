import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/dexie";
import {
  createBox,
  deleteBox,
  getBox,
  listBoxes,
  nextBoxNumber,
  updateBox,
} from "@/lib/repo/boxes";
import { createItem } from "@/lib/repo/items";
import { makeBox } from "@/test/factories/rows";

describe("boxes repo > createBox", () => {
  it("writes a dirty box to Dexie and enqueues an insert", async () => {
    const box = await createBox({ destination_room: "  Kitchen  ", notes: "  fragile  " }, "user-1");

    expect(box.destination_room).toBe("Kitchen");
    expect(box.notes).toBe("fragile");
    expect(box._dirty).toBe(1);
    expect(box.created_by).toBe("user-1");

    const stored = await db().boxes.get(box.id);
    expect(stored?.destination_room).toBe("Kitchen");

    const outbox = await db().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "boxes", op: "insert", row_id: box.id });
  });

  it("normalises empty notes to null", async () => {
    const box = await createBox({ destination_room: "Garage", notes: "   " }, null);
    expect(box.notes).toBeNull();
  });
});

describe("boxes repo > nextBoxNumber", () => {
  it("returns 1 when there are no boxes", async () => {
    expect(await nextBoxNumber()).toBe(1);
  });

  it("returns one above the max, ignoring soft-deleted boxes", async () => {
    await db().boxes.bulkAdd([
      makeBox({ id: "a", number: 3 }),
      makeBox({ id: "b", number: 7 }),
      makeBox({ id: "c", number: 99, _deleted: 1 }),
    ]);
    expect(await nextBoxNumber()).toBe(8);
  });

  it("assigns sequential numbers when called repeatedly", async () => {
    const a = await createBox({ destination_room: "Kitchen" }, null);
    const b = await createBox({ destination_room: "Garage" }, null);
    const c = await createBox({ destination_room: "Loft" }, null);
    expect([a.number, b.number, c.number]).toEqual([1, 2, 3]);
  });
});

describe("boxes repo > updateBox", () => {
  it("enqueues an update payload with trimmed fields and bumps updated_at", async () => {
    const box = await createBox({ destination_room: "Kitchen" }, null);
    await db().outbox.clear();
    const beforeUpdatedAt = box.updated_at;

    await new Promise((r) => setTimeout(r, 2));
    await updateBox(box.id, { destination_room: "  Garage  ", notes: "  heavy  ", sealed: true });

    const stored = await db().boxes.get(box.id);
    expect(stored?.destination_room).toBe("Garage");
    expect(stored?.notes).toBe("heavy");
    expect(stored?.sealed).toBe(true);
    expect(stored!.updated_at > beforeUpdatedAt).toBe(true);
    expect(stored?._dirty).toBe(1);

    const outbox = await db().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "boxes", op: "update", row_id: box.id });
    expect(outbox[0].payload).toMatchObject({
      destination_room: "Garage",
      notes: "heavy",
      sealed: true,
    });
  });

  it("is a no-op when the box does not exist", async () => {
    await updateBox("does-not-exist", { sealed: true });
    expect(await db().outbox.count()).toBe(0);
  });
});

describe("boxes repo > deleteBox", () => {
  it("soft-deletes the box, cascades to items, and enqueues a delete", async () => {
    const box = await createBox({ destination_room: "Kitchen" }, null);
    await createItem({ box_id: box.id, name: "kettle" }, null);
    await createItem({ box_id: box.id, name: "mugs" }, null);
    await db().outbox.clear();

    await deleteBox(box.id);

    const stored = await db().boxes.get(box.id);
    expect(stored?._deleted).toBe(1);

    const items = await db().items.where("box_id").equals(box.id).toArray();
    expect(items.every((i) => i._deleted === 1)).toBe(true);

    const outbox = await db().outbox.orderBy("seq").toArray();
    const itemDeletes = outbox.filter((e) => e.table === "items" && e.op === "delete");
    const boxDelete = outbox.find((e) => e.table === "boxes" && e.op === "delete");
    expect(itemDeletes).toHaveLength(2);
    expect(boxDelete).toBeDefined();
    // box delete must come after item deletes — server FK would otherwise reject
    expect(outbox.at(-1)).toEqual(boxDelete);
  });
});

describe("boxes repo > listBoxes", () => {
  it("filters soft-deleted, filters by room, sorts newest first, attaches itemCount", async () => {
    const oldest = await createBox({ destination_room: "Kitchen" }, null);
    await new Promise((r) => setTimeout(r, 5));
    const newer = await createBox({ destination_room: "Garage" }, null);
    await new Promise((r) => setTimeout(r, 5));
    const newest = await createBox({ destination_room: "Kitchen" }, null);
    const hidden = await createBox({ destination_room: "Kitchen" }, null);
    await deleteBox(hidden.id);

    await createItem({ box_id: oldest.id, name: "a" }, null);
    await createItem({ box_id: oldest.id, name: "b" }, null);
    await createItem({ box_id: newest.id, name: "c" }, null);

    const all = await listBoxes();
    expect(all.map((b) => b.id)).toEqual([newest.id, newer.id, oldest.id]);
    expect(all.find((b) => b.id === oldest.id)?.itemCount).toBe(2);
    expect(all.find((b) => b.id === newer.id)?.itemCount).toBe(0);

    const kitchen = await listBoxes({ room: "Kitchen" });
    expect(kitchen.map((b) => b.id)).toEqual([newest.id, oldest.id]);
  });
});

describe("boxes repo > getBox", () => {
  it("returns undefined for soft-deleted boxes", async () => {
    const box = await createBox({ destination_room: "Kitchen" }, null);
    await deleteBox(box.id);
    expect(await getBox(box.id)).toBeUndefined();
  });
});
