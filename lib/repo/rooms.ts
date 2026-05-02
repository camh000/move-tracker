import { v4 as uuidv4 } from "uuid";
import { db, type RoomRow } from "@/lib/db/dexie";
import { enqueue } from "@/lib/db/sync";

export async function listRooms(): Promise<RoomRow[]> {
  const rows = await db().rooms.toArray();
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export async function addRoom(name: string): Promise<RoomRow> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Room name is required");
  const existing = await db().rooms.where("name").equalsIgnoreCase(trimmed).first();
  if (existing) return existing;
  const id = uuidv4();
  const row: RoomRow = {
    id,
    name: trimmed,
    created_at: new Date().toISOString(),
    _dirty: 1,
  };
  await db().rooms.put(row);
  await enqueue({ table: "rooms", op: "insert", row_id: id, payload: { ...row } });
  return row;
}

export async function deleteRoom(id: string) {
  const row = await db().rooms.get(id);
  if (!row) return;
  await db().rooms.delete(id);
  await enqueue({ table: "rooms", op: "delete", row_id: id, payload: { id } });
}
