import { v4 as uuidv4 } from "uuid";
import { db, type BoxRow } from "@/lib/db/dexie";
import { enqueue } from "@/lib/db/sync";
import { deleteItem } from "@/lib/repo/items";

export interface BoxWithItemCount extends BoxRow {
  itemCount: number;
  unpackedCount: number;
}

export async function listBoxes(opts: { room?: string } = {}): Promise<BoxWithItemCount[]> {
  const all = await db().boxes.toArray();
  const filtered = all
    .filter((b) => b._deleted !== 1)
    .filter((b) => (opts.room ? b.destination_room === opts.room : true))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // Compute item counts in one pass
  const items = await db().items.toArray();
  const counts = new Map<string, { total: number; unpacked: number }>();
  for (const it of items) {
    if (it._deleted === 1) continue;
    const c = counts.get(it.box_id) ?? { total: 0, unpacked: 0 };
    c.total++;
    if (it.unpacked) c.unpacked++;
    counts.set(it.box_id, c);
  }
  return filtered.map((b) => ({
    ...b,
    itemCount: counts.get(b.id)?.total ?? 0,
    unpackedCount: counts.get(b.id)?.unpacked ?? 0,
  }));
}

export async function getBox(id: string): Promise<BoxRow | undefined> {
  const row = await db().boxes.get(id);
  if (row?._deleted === 1) return undefined;
  return row;
}

export async function findBoxByNumber(number: number): Promise<BoxRow | undefined> {
  const rows = await db().boxes.where("number").equals(number).toArray();
  return rows.find((b) => b._deleted !== 1);
}

export async function nextBoxNumber(): Promise<number> {
  const all = await db().boxes.toArray();
  const max = all.reduce((acc, b) => (b._deleted === 1 ? acc : Math.max(acc, b.number)), 0);
  return max + 1;
}

export interface CreateBoxInput {
  destination_room: string;
  notes?: string | null;
  open_first?: boolean;
  fragile?: boolean;
  heavy?: boolean;
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
    open_first: input.open_first ?? false,
    fragile: input.fragile ?? false,
    heavy: input.heavy ?? false,
    arrived: false,
    unpacked: false,
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

export type BoxPatch = Partial<
  Pick<BoxRow, "destination_room" | "notes" | "sealed" | "open_first" | "fragile" | "heavy" | "arrived" | "unpacked">
>;

export async function updateBox(id: string, patch: BoxPatch) {
  const existing = await db().boxes.get(id);
  if (!existing) return;
  const clean: BoxPatch = { ...patch };
  if (patch.notes !== undefined) clean.notes = patch.notes?.toString().trim() || null;
  if (patch.destination_room !== undefined) clean.destination_room = patch.destination_room.trim();

  await db().boxes.put({ ...existing, ...clean, updated_at: new Date().toISOString(), _dirty: 1 });
  // Only the changed fields go up, so edits to different fields by the two
  // of you don't overwrite each other.
  await enqueue({ table: "boxes", op: "update", row_id: id, payload: clean });
}

export async function deleteBox(id: string) {
  // Cascade locally through items → photos so Storage objects are queued for
  // removal and orphan rows don't linger in IndexedDB.
  const items = await db().items.where("box_id").equals(id).toArray();
  for (const item of items) {
    if (item._deleted === 1) continue;
    await deleteItem(item.id);
  }
  await db().boxes.update(id, { _deleted: 1, _dirty: 1 });
  await enqueue({ table: "boxes", op: "delete", row_id: id, payload: { id } });
}
