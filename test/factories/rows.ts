import type { BoxRow, ItemRow, ItemPhotoRow, RoomRow, OutboxEntry } from "@/lib/db/dexie";

let idCounter = 0;
function id(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString().padStart(4, "0")}`;
}

export function resetIdCounter() {
  idCounter = 0;
}

export function makeBox(overrides: Partial<BoxRow> = {}): BoxRow {
  const now = new Date().toISOString();
  return {
    id: id("box"),
    number: 1,
    destination_room: "Kitchen",
    notes: null,
    sealed: false,
    created_by: "test-user-id",
    created_at: now,
    updated_at: now,
    _dirty: 0,
    _deleted: 0,
    ...overrides,
  };
}

export function makeItem(overrides: Partial<ItemRow> = {}): ItemRow {
  const now = new Date().toISOString();
  return {
    id: id("item"),
    box_id: "box-0001",
    name: "Test item",
    description: null,
    created_by: "test-user-id",
    created_at: now,
    updated_at: now,
    _dirty: 0,
    _deleted: 0,
    ...overrides,
  };
}

export function makePhoto(overrides: Partial<ItemPhotoRow> = {}): ItemPhotoRow {
  const now = new Date().toISOString();
  return {
    id: id("photo"),
    item_id: "item-0001",
    storage_path: null,
    display_order: 0,
    created_at: now,
    _local_blob: null,
    _dirty: 0,
    _deleted: 0,
    ...overrides,
  };
}

export function makeRoom(overrides: Partial<RoomRow> = {}): RoomRow {
  return {
    id: id("room"),
    name: "Kitchen",
    created_at: new Date().toISOString(),
    _dirty: 0,
    ...overrides,
  };
}

export function makeOutboxEntry(overrides: Partial<OutboxEntry> & Pick<OutboxEntry, "table" | "op" | "row_id">): OutboxEntry {
  return {
    payload: {},
    attempts: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
