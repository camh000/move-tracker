import { v4 as uuidv4 } from "uuid";
import { db, type ItemRow, type ItemPhotoRow } from "@/lib/db/dexie";
import { enqueue } from "@/lib/db/sync";

export interface ItemWithPhotos extends ItemRow {
  photos: ItemPhotoRow[];
}

export async function listItemsForBox(boxId: string): Promise<ItemWithPhotos[]> {
  const items = (await db().items.where("box_id").equals(boxId).toArray()).filter(
    (i) => i._deleted !== 1,
  );
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const photos = await db().item_photos.toArray();
  const photosByItem = new Map<string, ItemPhotoRow[]>();
  for (const p of photos) {
    if (p._deleted === 1) continue;
    const arr = photosByItem.get(p.item_id) ?? [];
    arr.push(p);
    photosByItem.set(p.item_id, arr);
  }
  return items.map((i) => ({
    ...i,
    photos: (photosByItem.get(i.id) ?? []).sort((a, b) => a.display_order - b.display_order),
  }));
}

export async function getItem(id: string): Promise<ItemWithPhotos | undefined> {
  const item = await db().items.get(id);
  if (!item || item._deleted === 1) return undefined;
  const photos = (await db().item_photos.where("item_id").equals(id).toArray())
    .filter((p) => p._deleted !== 1)
    .sort((a, b) => a.display_order - b.display_order);
  return { ...item, photos };
}

export interface CreateItemInput {
  box_id: string;
  name: string;
  description?: string | null;
  photoBlobs?: Blob[];
}

export async function createItem(input: CreateItemInput, userId: string | null): Promise<ItemRow> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const row: ItemRow = {
    id,
    box_id: input.box_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    created_by: userId,
    created_at: now,
    updated_at: now,
    _dirty: 1,
    _deleted: 0,
  };
  await db().items.put(row);
  await enqueue({ table: "items", op: "insert", row_id: id, payload: { ...row } });

  if (input.photoBlobs?.length) {
    let order = 0;
    for (const blob of input.photoBlobs) {
      const photoId = uuidv4();
      const photo: ItemPhotoRow = {
        id: photoId,
        item_id: id,
        storage_path: null,
        display_order: order,
        created_at: new Date().toISOString(),
        _local_blob: blob,
        _dirty: 1,
        _deleted: 0,
      };
      await db().item_photos.put(photo);
      await enqueue({ table: "item_photos", op: "upload_blob", row_id: photoId, payload: { item_id: id } });
      order++;
    }
  }

  return row;
}

export async function updateItem(id: string, patch: Partial<Pick<ItemRow, "name" | "description" | "box_id">>) {
  const existing = await db().items.get(id);
  if (!existing) return;
  const now = new Date().toISOString();
  const next: ItemRow = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    description: patch.description !== undefined ? (patch.description?.toString().trim() || null) : existing.description,
    box_id: patch.box_id ?? existing.box_id,
    updated_at: now,
    _dirty: 1,
  };
  await db().items.put(next);
  await enqueue({
    table: "items",
    op: "update",
    row_id: id,
    payload: {
      name: next.name,
      description: next.description,
      box_id: next.box_id,
      updated_at: next.updated_at,
    },
  });
}

export async function deleteItem(id: string) {
  await db().items.update(id, { _deleted: 1, _dirty: 1 });
  await enqueue({ table: "items", op: "delete", row_id: id, payload: { id } });
}

export async function addPhotoToItem(itemId: string, blob: Blob) {
  const existingPhotos = await db().item_photos.where("item_id").equals(itemId).toArray();
  const order = existingPhotos.reduce((acc, p) => Math.max(acc, p.display_order), -1) + 1;
  const photoId = uuidv4();
  const photo: ItemPhotoRow = {
    id: photoId,
    item_id: itemId,
    storage_path: null,
    display_order: order,
    created_at: new Date().toISOString(),
    _local_blob: blob,
    _dirty: 1,
    _deleted: 0,
  };
  await db().item_photos.put(photo);
  await enqueue({ table: "item_photos", op: "upload_blob", row_id: photoId, payload: { item_id: itemId } });
  return photo;
}

export async function deletePhoto(photoId: string) {
  const photo = await db().item_photos.get(photoId);
  if (!photo) return;
  await db().item_photos.update(photoId, { _deleted: 1, _dirty: 1 });
  await enqueue({
    table: "item_photos",
    op: "delete",
    row_id: photoId,
    payload: { id: photoId, storage_path: photo.storage_path },
  });
}
