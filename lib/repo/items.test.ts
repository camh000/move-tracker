import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/dexie";
import {
  addPhotoToItem,
  createItem,
  deleteItem,
  deletePhoto,
  getItem,
  listItemsForBox,
  updateItem,
} from "@/lib/repo/items";

describe("items repo > createItem", () => {
  it("writes a dirty item and enqueues a single insert when no photos", async () => {
    const item = await createItem({ box_id: "b-1", name: "  kettle  " }, "user-1");
    expect(item.name).toBe("kettle");
    expect(item._dirty).toBe(1);

    const stored = await db().items.get(item.id);
    expect(stored?.name).toBe("kettle");

    const outbox = await db().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "items", op: "insert", row_id: item.id });
  });

  it("enqueues an upload_blob per photo in display order", async () => {
    const blob1 = new Blob([new Uint8Array([1])]);
    const blob2 = new Blob([new Uint8Array([2])]);
    const item = await createItem(
      { box_id: "b-1", name: "kettle", photoBlobs: [blob1, blob2] },
      null,
    );

    const outbox = await db().outbox.orderBy("seq").toArray();
    expect(outbox).toHaveLength(3);
    expect(outbox[0]).toMatchObject({ table: "items", op: "insert", row_id: item.id });
    expect(outbox[1]).toMatchObject({ table: "item_photos", op: "upload_blob" });
    expect(outbox[2]).toMatchObject({ table: "item_photos", op: "upload_blob" });

    const photos = await db().item_photos.where("item_id").equals(item.id).toArray();
    expect(photos.map((p) => p.display_order).sort()).toEqual([0, 1]);
    expect(photos.every((p) => p._dirty === 1)).toBe(true);
    expect(photos.every((p) => p._local_blob != null)).toBe(true);
  });
});

describe("items repo > updateItem", () => {
  it("enqueues an update payload with trimmed fields", async () => {
    const item = await createItem({ box_id: "b-1", name: "kettle" }, null);
    await db().outbox.clear();
    const beforeUpdatedAt = item.updated_at;

    await new Promise((r) => setTimeout(r, 2));
    await updateItem(item.id, { name: "  electric kettle  ", description: "  black  " });

    const stored = await db().items.get(item.id);
    expect(stored?.name).toBe("electric kettle");
    expect(stored?.description).toBe("black");
    expect(stored!.updated_at > beforeUpdatedAt).toBe(true);

    const outbox = await db().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "items", op: "update", row_id: item.id });
    expect(outbox[0].payload).toMatchObject({ name: "electric kettle", description: "black" });
  });
});

describe("items repo > deleteItem", () => {
  it("cascades to photos (soft-delete + enqueue) and emits photo deletes before the item delete", async () => {
    const blob = new Blob([new Uint8Array([1])]);
    const item = await createItem({ box_id: "b-1", name: "kettle", photoBlobs: [blob, blob] }, null);
    await db().outbox.clear();

    await deleteItem(item.id);

    const photos = await db().item_photos.where("item_id").equals(item.id).toArray();
    expect(photos.every((p) => p._deleted === 1 && p._dirty === 1)).toBe(true);

    const stored = await db().items.get(item.id);
    expect(stored?._deleted).toBe(1);

    const outbox = await db().outbox.orderBy("seq").toArray();
    const photoDeletes = outbox.filter((e) => e.table === "item_photos" && e.op === "delete");
    const itemDelete = outbox.find((e) => e.table === "items" && e.op === "delete");
    expect(photoDeletes).toHaveLength(2);
    expect(itemDelete).toBeDefined();
    expect(outbox.at(-1)).toEqual(itemDelete);
  });
});

describe("items repo > addPhotoToItem / deletePhoto", () => {
  it("addPhotoToItem assigns the next display_order and enqueues upload_blob", async () => {
    const item = await createItem({ box_id: "b-1", name: "kettle" }, null);
    await db().outbox.clear();

    const p1 = await addPhotoToItem(item.id, new Blob([new Uint8Array([1])]));
    const p2 = await addPhotoToItem(item.id, new Blob([new Uint8Array([2])]));

    expect(p1.display_order).toBe(0);
    expect(p2.display_order).toBe(1);

    const outbox = await db().outbox.toArray();
    expect(outbox.filter((e) => e.op === "upload_blob")).toHaveLength(2);
  });

  it("deletePhoto soft-deletes and enqueues with storage_path in payload", async () => {
    const item = await createItem({ box_id: "b-1", name: "kettle" }, null);
    const photo = await addPhotoToItem(item.id, new Blob([new Uint8Array([1])]));
    await db().item_photos.update(photo.id, { storage_path: "user-1/item-1/photo.jpg" });
    await db().outbox.clear();

    await deletePhoto(photo.id);

    const stored = await db().item_photos.get(photo.id);
    expect(stored?._deleted).toBe(1);

    const outbox = await db().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload).toMatchObject({ storage_path: "user-1/item-1/photo.jpg" });
  });
});

describe("items repo > read helpers", () => {
  it("listItemsForBox excludes soft-deleted items and attaches photos sorted by display_order", async () => {
    const item = await createItem(
      { box_id: "b-1", name: "kettle", photoBlobs: [new Blob([new Uint8Array([1])])] },
      null,
    );
    const ghost = await createItem({ box_id: "b-1", name: "ghost" }, null);
    await deleteItem(ghost.id);

    const list = await listItemsForBox("b-1");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(item.id);
    expect(list[0].photos).toHaveLength(1);
  });

  it("getItem returns undefined for soft-deleted items", async () => {
    const item = await createItem({ box_id: "b-1", name: "kettle" }, null);
    await deleteItem(item.id);
    expect(await getItem(item.id)).toBeUndefined();
  });
});
