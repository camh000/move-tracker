import { v4 as uuidv4 } from "uuid";
import { db, type BoxRow } from "@/lib/db/dexie";
import { enqueue } from "@/lib/db/sync";

export interface BoxWithItemCount extends BoxRow {
  itemCount: number;
}

export async function listBoxes(opts: { room?: string } = {}): Promise<BoxWithItemCount[]> {
  const all = await db().boxes.toArray();
  const filtered = all
    .filter((b) => b._deleted !== 1)
    .filter((b) => (opts.room ? b.destination_room === opts.room : true))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // Compute item counts in one pass
  const items = await db().items.toArray();
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it._deleted === 1) continue;
    counts.set(it.box_id, (counts.get(it.box_id) ?? 0) + 1);
  }
  return filtered.map((b) => ({ ...b, itemCount: counts.get(b.id) ?? 0 }));
}

export async function getBox(id: string): Promise<BoxRow | undefined> {
  const row = await db().boxes.get(id);
  if (row?._deleted === 1) return undefined;
  return row;
}

export async function nextBoxNumber(): Promise<number> {
  const all = await db().boxes.toArray();
  const max = all.reduce((acc, b) => (b._deleted === 1 ? acc : Math.max(acc, b.number)), 0);
  return max + 1;
}

export interface CreateBoxInput {
  destination_room: string;
  notes?: string | null;
}

export async function createBox(
  input: CreateBoxInput,
  userId: string | null,
): Promise<BoxRow> {
  const id = uuidv4();
  const number = await nextBoxNumber();
  const now = new Date().toISOString();
  const row: BoxRow = {
    id,
    number,
    destination_room: input.destination_room.trim(),
    notes: input.notes?.trim() || null,
    sealed: false,
    created_by: userId,
    created_at: now,
    updated_at: now,
    _dirty: 1,
    _deleted: 0,
  };
  await db().boxes.put(row);
  await enqueue({ table: "boxes", op: "insert", row_id: id, payload: { ...row } });
  return row;
}

export async function updateBox(id: string, patch: Partial<Pick<BoxRow, "destination_room" | "notes" | "sealed">>) {
  const now = new Date().toISOString();
  const existing = await db().boxes.get(id);
  if (!existing) return;
  const next: BoxRow = {
    ...existing,
    ...patch,
    notes: patch.notes !== undefined ? (patch.notes?.toString().trim() || null) : existing.notes,
    destination_room: patch.destination_room !== undefined ? patch.destination_room.trim() : existing.destination_room,
    updated_at: now,
    _dirty: 1,
  };
  await db().boxes.put(next);
  await enqueue({
    table: "boxes",
    op: "update",
    row_id: id,
    payload: {
      destination_room: next.destination_room,
      notes: next.notes,
      sealed: next.sealed,
      updated_at: next.updated_at,
    },
  });
}

export async function deleteBox(id: string) {
  await db().boxes.update(id, { _deleted: 1, _dirty: 1 });
  await enqueue({ table: "boxes", op: "delete", row_id: id, payload: { id } });
}
