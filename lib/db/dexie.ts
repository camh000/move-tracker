import Dexie, { type Table } from "dexie";

export interface BoxRow {
  id: string;
  number: number;
  destination_room: string;
  notes: string | null;
  sealed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  _dirty?: 0 | 1;
  _deleted?: 0 | 1;
}

export interface ItemRow {
  id: string;
  box_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  _dirty?: 0 | 1;
  _deleted?: 0 | 1;
}

export interface ItemPhotoRow {
  id: string;
  item_id: string;
  storage_path: string | null;
  display_order: number;
  created_at: string;
  _local_blob?: Blob | null;
  _dirty?: 0 | 1;
  _deleted?: 0 | 1;
}

export interface RoomRow {
  id: string;
  name: string;
  created_at: string;
  _dirty?: 0 | 1;
}

export type OutboxOp =
  | { table: "boxes"; op: "insert" | "update" | "delete"; row_id: string; payload: Partial<BoxRow> }
  | { table: "items"; op: "insert" | "update" | "delete"; row_id: string; payload: Partial<ItemRow> }
  | { table: "item_photos"; op: "insert" | "update" | "delete" | "upload_blob"; row_id: string; payload: Partial<ItemPhotoRow> }
  | { table: "rooms"; op: "insert" | "delete"; row_id: string; payload: Partial<RoomRow> };

export interface OutboxEntry {
  seq?: number;
  table: OutboxOp["table"];
  op: OutboxOp["op"];
  row_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
  last_error?: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class MoveTrackerDB extends Dexie {
  boxes!: Table<BoxRow, string>;
  items!: Table<ItemRow, string>;
  item_photos!: Table<ItemPhotoRow, string>;
  rooms!: Table<RoomRow, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("movetracker");
    this.version(1).stores({
      boxes: "id, number, destination_room, sealed, updated_at, _dirty, _deleted",
      items: "id, box_id, name, updated_at, _dirty, _deleted",
      item_photos: "id, item_id, storage_path, _dirty, _deleted",
      rooms: "id, &name",
      outbox: "++seq, table, row_id, created_at",
      meta: "key",
    });
  }
}

let _db: MoveTrackerDB | null = null;

export function db(): MoveTrackerDB {
  if (typeof window === "undefined") {
    throw new Error("Dexie database is only available in the browser.");
  }
  if (!_db) _db = new MoveTrackerDB();
  return _db;
}
