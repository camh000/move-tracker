import { db, type BoxRow, type ItemRow, type ItemPhotoRow, type RoomRow, type OutboxEntry } from "./dexie";
import { createClient } from "@/lib/supabase/client";
import { cachePhotoBlob } from "@/lib/utils/photo-url";

const META_LAST_SYNC = "last_sync_at";
const META_LAST_RECONCILE = "last_reconcile_at";
/** Max server `updated_at` seen so far (server clock, ISO string). */
const META_CURSOR = "server_cursor";
const STORAGE_BUCKET = "item-photos";
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
/**
 * Re-read this much history behind the cursor on every pull. Postgres stamps
 * now() at transaction start, so a slow transaction can commit a row slightly
 * "behind" rows we've already seen. Re-reading a short window is cheap and
 * makes that race harmless.
 */
const CURSOR_OVERLAP_MS = 2 * 60 * 1000;
/** PostgREST's default max-rows is 1000; page at that size. */
const PAGE_SIZE = 1000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 10 * 60 * 1000;

type Table = "boxes" | "items" | "item_photos" | "rooms";
type Supabase = ReturnType<typeof createClient>;

const BOX_UPDATE_COLS = [
  "destination_room",
  "notes",
  "sealed",
  "open_first",
  "fragile",
  "heavy",
  "arrived",
  "unpacked",
] as const;
const ITEM_UPDATE_COLS = ["name", "description", "box_id", "unpacked"] as const;

export interface SyncResult {
  /** Outbox entries still waiting to go up (includes failed ones). */
  pending: number;
  /** Entries the server rejected outright — need the user to retry or discard. */
  failed: number;
  lastSyncAt: number | null;
  changed: boolean;
  /** Most recent error from an entry that is still retrying, if any. */
  retryError: string | null;
}

let inFlight: Promise<SyncResult> | null = null;

export async function runSync(opts: { ignoreBackoff?: boolean } = {}): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const hasCursor = (await db().meta.get(META_CURSOR)) != null;
      const drained = await drainOutbox(opts);
      // First run on this device (or first run after upgrading): do a full pull.
      const pulled = hasCursor ? await deltaPull() : await pullEverything();
      const reconciled = hasCursor ? await maybeReconcile() : false;
      await db().meta.put({ key: META_LAST_SYNC, value: Date.now() });
      return { ...(await outboxSummary()), changed: drained || pulled || reconciled };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function outboxSummary(): Promise<Omit<SyncResult, "changed">> {
  const entries = await db().outbox.toArray();
  const failed = entries.filter((e) => e.failed === 1).length;
  // attempts only counts real server errors — not dropped connections.
  const retrying = entries.filter((e) => e.failed !== 1 && e.attempts > 0 && e.last_error);
  const lastSyncAt = ((await db().meta.get(META_LAST_SYNC))?.value as number | undefined) ?? null;
  return {
    pending: entries.length,
    failed,
    lastSyncAt,
    retryError: retrying.length ? retrying[retrying.length - 1].last_error ?? null : null,
  };
}

// ---------------------------------------------------------------------------
// Pulling
// ---------------------------------------------------------------------------

/**
 * Fetch every row of a table, paging past PostgREST's 1000-row cap.
 * `filter` narrows the query (e.g. updated_at > x).
 */
async function fetchAll<T>(
  supabase: Supabase,
  table: Table,
  columns: string,
  filter?: { gtUpdatedAt: string },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase.from(table).select(columns);
    if (filter) q = q.gt("updated_at", filter.gtUpdatedAt);
    const { data, error } = await q.order("id").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Row ids with a change still waiting in the outbox — local copy wins for these. */
async function pendingRowIds(): Promise<Record<Table, Set<string>>> {
  const out: Record<Table, Set<string>> = {
    boxes: new Set(),
    items: new Set(),
    item_photos: new Set(),
    rooms: new Set(),
  };
  for (const e of await db().outbox.toArray()) out[e.table].add(e.row_id);
  return out;
}

interface ServerRows {
  boxes: BoxRow[];
  items: ItemRow[];
  item_photos: ItemPhotoRow[];
  rooms: RoomRow[];
}

async function fetchServerRows(since: string | null): Promise<ServerRows> {
  const supabase = createClient();
  const filter = since ? { gtUpdatedAt: since } : undefined;
  const [boxes, items, item_photos, rooms] = await Promise.all([
    fetchAll<BoxRow>(supabase, "boxes", "*", filter),
    fetchAll<ItemRow>(supabase, "items", "*", filter),
    fetchAll<ItemPhotoRow>(supabase, "item_photos", "*", filter),
    fetchAll<RoomRow>(supabase, "rooms", "*", filter),
  ]);
  return {
    boxes: boxes.map(stripServerOnly),
    items: items.map(stripServerOnly),
    item_photos,
    rooms,
  };
}

function stripServerOnly<T extends object>(row: T): T {
  const rest = { ...(row as T & { search_vector?: unknown }) };
  delete rest.search_vector;
  return rest as T;
}

function maxUpdatedAt(rows: ServerRows): string | null {
  let max: string | null = null;
  let maxMs = -Infinity;
  for (const list of [rows.boxes, rows.items, rows.item_photos, rows.rooms]) {
    for (const r of list as { updated_at?: string }[]) {
      if (!r.updated_at) continue;
      const ms = Date.parse(r.updated_at);
      if (ms > maxMs) {
        maxMs = ms;
        max = r.updated_at;
      }
    }
  }
  return max;
}

/**
 * Write server rows into Dexie. The server is the source of truth for any row
 * that has no local change still queued in the outbox.
 */
async function applyServerRows(rows: ServerRows): Promise<boolean> {
  const pending = await pendingRowIds();
  let changed = false;

  await db().transaction(
    "rw",
    [db().boxes, db().items, db().item_photos, db().rooms, db().meta],
    async () => {
      const boxes = rows.boxes.filter((r) => !pending.boxes.has(r.id));
      const items = rows.items.filter((r) => !pending.items.has(r.id));
      const photos = rows.item_photos.filter((r) => !pending.item_photos.has(r.id));
      await db().boxes.bulkPut(boxes.map((r) => ({ ...r, _dirty: 0 as const, _deleted: 0 as const })));
      await db().items.bulkPut(items.map((r) => ({ ...r, _dirty: 0 as const, _deleted: 0 as const })));
      await db().item_photos.bulkPut(
        photos.map((r) => ({ ...r, _local_blob: null, _dirty: 0 as const, _deleted: 0 as const })),
      );
      if (boxes.length || items.length || photos.length) changed = true;
      for (const row of rows.rooms) {
        if (pending.rooms.has(row.id)) continue;
        // `name` is unique in Dexie; drop any local duplicate created offline
        // under a different id before storing the server's copy.
        const clash = await db().rooms.where("name").equalsIgnoreCase(row.name).first();
        if (clash && clash.id !== row.id) await db().rooms.delete(clash.id);
        await db().rooms.put({ ...row, _dirty: 0 });
        changed = true;
      }

      const newCursor = maxUpdatedAt(rows);
      if (newCursor) {
        const cur = (await db().meta.get(META_CURSOR))?.value as string | undefined;
        if (!cur || Date.parse(newCursor) > Date.parse(cur)) {
          await db().meta.put({ key: META_CURSOR, value: newCursor });
        }
      } else if (!(await db().meta.get(META_CURSOR))) {
        // Empty database: start the cursor at the epoch so we switch to deltas.
        await db().meta.put({ key: META_CURSOR, value: new Date(0).toISOString() });
      }
    },
  );
  return changed;
}

async function deltaPull(): Promise<boolean> {
  const cursor = (await db().meta.get(META_CURSOR))?.value as string | undefined;
  const since = cursor
    ? new Date(Math.max(0, Date.parse(cursor) - CURSOR_OVERLAP_MS)).toISOString()
    : null;
  const rows = await fetchServerRows(since);
  return applyServerRows(rows);
}

/** Full download of everything, then drop local rows the server no longer has. */
async function pullEverything(): Promise<boolean> {
  const rows = await fetchServerRows(null);
  const changed = await applyServerRows(rows);
  const removed = await removeRowsMissingFromServer({
    boxes: new Set(rows.boxes.map((r) => r.id)),
    items: new Set(rows.items.map((r) => r.id)),
    item_photos: new Set(rows.item_photos.map((r) => r.id)),
    rooms: new Set(rows.rooms.map((r) => r.id)),
  });
  return changed || removed;
}

/** Full re-download from the server. Used on first sign-in and by "Repair sync". */
export async function primeFromServer(): Promise<void> {
  await pullEverything();
  await db().meta.put({ key: META_LAST_SYNC, value: Date.now() });
}

async function maybeReconcile(): Promise<boolean> {
  const last = ((await db().meta.get(META_LAST_RECONCILE))?.value as number | undefined) ?? 0;
  if (Date.now() - last < RECONCILE_INTERVAL_MS) return false;
  return reconcileWithServer();
}

/**
 * Deletes never show up in a delta pull, so periodically compare full id lists
 * and drop local rows (with no pending local change) that the server no longer has.
 */
export async function reconcileWithServer(): Promise<boolean> {
  const supabase = createClient();
  const [boxes, items, photos, rooms] = await Promise.all([
    fetchAll<{ id: string }>(supabase, "boxes", "id"),
    fetchAll<{ id: string }>(supabase, "items", "id"),
    fetchAll<{ id: string }>(supabase, "item_photos", "id"),
    fetchAll<{ id: string }>(supabase, "rooms", "id"),
  ]);
  return removeRowsMissingFromServer({
    boxes: new Set(boxes.map((r) => r.id)),
    items: new Set(items.map((r) => r.id)),
    item_photos: new Set(photos.map((r) => r.id)),
    rooms: new Set(rooms.map((r) => r.id)),
  });
}

async function removeRowsMissingFromServer(server: Record<Table, Set<string>>): Promise<boolean> {
  const pending = await pendingRowIds();
  let removed = 0;
  await db().transaction(
    "rw",
    [db().boxes, db().items, db().item_photos, db().rooms, db().meta],
    async () => {
      for (const table of ["boxes", "items", "item_photos", "rooms"] as const) {
        const ids = (await db()[table].toCollection().primaryKeys()) as string[];
        const gone = ids.filter((id) => !pending[table].has(id) && !server[table].has(id));
        await db()[table].bulkDelete(gone);
        removed += gone.length;
      }
      await db().meta.put({ key: META_LAST_RECONCILE, value: Date.now() });
    },
  );
  return removed > 0;
}

// ---------------------------------------------------------------------------
// Pushing (outbox)
// ---------------------------------------------------------------------------

function entryKey(table: string, rowId: string) {
  return `${table}:${rowId}`;
}

/** Rows this entry can't be pushed before (its parent box / item). */
function parentKeys(entry: OutboxEntry): string[] {
  const p = entry.payload as { box_id?: string; item_id?: string };
  if (entry.table === "items" && entry.op !== "delete" && p.box_id) return [entryKey("boxes", p.box_id)];
  if (entry.table === "item_photos" && entry.op === "upload_blob" && p.item_id) {
    return [entryKey("items", p.item_id)];
  }
  return [];
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return "Unknown sync error";
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: unknown; statusCode?: unknown };
    if (typeof e.code === "string") return e.code;
    if (typeof e.statusCode === "string" || typeof e.statusCode === "number") return String(e.statusCode);
  }
  return undefined;
}

/**
 * The server rejected this change and retrying won't help (e.g. the box an
 * item belongs to was deleted by the other person). Needs a user decision.
 */
function isPermanent(err: unknown): boolean {
  const code = errorCode(err);
  return (
    code === "23503" || // foreign key violation
    code === "23502" || // not-null violation
    code === "23514" || // check violation
    code === "22P02" || // invalid input syntax
    code === "22001" || // value too long
    code === "413" // storage: payload too large
  );
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return /failed to fetch|networkerror|load failed|network request failed/i.test(errorMessage(err));
}

function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
}

/**
 * Push queued local changes. A failing entry no longer halts the queue: it is
 * retried with exponential backoff, and only later changes to the same row
 * (or to its children) wait behind it. Changes the server rejects outright are
 * marked `failed` and surfaced in the UI to retry or discard.
 */
export async function drainOutbox(opts: { ignoreBackoff?: boolean } = {}): Promise<boolean> {
  const supabase = createClient();
  const entries = await db().outbox.orderBy("seq").toArray();
  if (!entries.length) return false;

  const blocked = new Set<string>();
  const now = Date.now();
  let processed = 0;

  for (const entry of entries) {
    const key = entryKey(entry.table, entry.row_id);
    const waiting =
      entry.failed === 1 ||
      blocked.has(key) ||
      parentKeys(entry).some((k) => blocked.has(k)) ||
      (!opts.ignoreBackoff && (entry.next_attempt_at ?? 0) > now);
    if (waiting) {
      blocked.add(key);
      continue;
    }

    try {
      await processEntry(entry, supabase);
      if (entry.seq != null) await db().outbox.delete(entry.seq);
      processed++;
    } catch (err: unknown) {
      const attempts = entry.attempts + 1;
      const network = isNetworkError(err);
      if (entry.seq != null) {
        await db().outbox.update(entry.seq, {
          // Don't count dropped connections against the entry.
          attempts: network ? entry.attempts : attempts,
          last_error: errorMessage(err),
          next_attempt_at: network ? 0 : Date.now() + backoffMs(attempts),
          failed: !network && isPermanent(err) ? 1 : 0,
        });
      }
      blocked.add(key);
      // Connection dropped mid-drain: stop and try again when back online.
      if (network) break;
    }
  }
  return processed > 0;
}

function pick<T extends Record<string, unknown>>(src: T, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (c in src && src[c] !== undefined) out[c] = src[c];
  return out;
}

function withoutLocalFields<T extends object>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_") || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function isPkeyConflict(error: { code?: string; message?: string }) {
  return error.code === "23505" && /pkey/i.test(error.message ?? "");
}

async function processEntry(entry: OutboxEntry, supabase: Supabase): Promise<void> {
  const { table, op, row_id } = entry;
  const payload = entry.payload as Record<string, unknown>;

  if (table === "boxes") {
    if (op === "insert") {
      for (let attempts = 0; attempts < 5; attempts++) {
        const local = await db().boxes.get(row_id);
        if (!local) return;
        const { error } = await supabase.from("boxes").insert(withoutLocalFields(local));
        // pkey conflict = an earlier attempt landed but we never saw the reply.
        if (!error || isPkeyConflict(error)) {
          await db().boxes.update(row_id, { _dirty: 0 });
          return;
        }
        // 23505 on the number column = the other person already used this number.
        if (error.code === "23505" && /number/i.test(error.message)) {
          const { data: maxRows } = await supabase
            .from("boxes")
            .select("number")
            .order("number", { ascending: false })
            .limit(1);
          const nextNumber = (maxRows?.[0]?.number ?? 0) + 1 + attempts;
          const oldNumber = local.number;
          await db().boxes.update(row_id, { number: nextNumber });
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("box-renumbered", { detail: { from: oldNumber, to: nextNumber, id: row_id } }),
            );
          }
          continue;
        }
        throw error;
      }
      throw new Error("Box renumber retries exhausted");
    } else if (op === "update") {
      const patch = pick(payload, BOX_UPDATE_COLS);
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("boxes").update(patch).eq("id", row_id);
        if (error) throw error;
      }
      await db().boxes.update(row_id, { _dirty: 0 });
    } else if (op === "delete") {
      const { error } = await supabase.from("boxes").delete().eq("id", row_id);
      if (error) throw error;
      await db().boxes.delete(row_id);
    }
  } else if (table === "items") {
    if (op === "insert") {
      const local = await db().items.get(row_id);
      if (!local) return;
      const { error } = await supabase.from("items").insert(withoutLocalFields(local));
      if (error && !isPkeyConflict(error)) throw error;
      await db().items.update(row_id, { _dirty: 0 });
    } else if (op === "update") {
      const patch = pick(payload, ITEM_UPDATE_COLS);
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("items").update(patch).eq("id", row_id);
        if (error) throw error;
      }
      await db().items.update(row_id, { _dirty: 0 });
    } else if (op === "delete") {
      const { error } = await supabase.from("items").delete().eq("id", row_id);
      if (error) throw error;
      await db().items.delete(row_id);
    }
  } else if (table === "item_photos") {
    const local = await db().item_photos.get(row_id);
    if (!local && op !== "delete") return;

    if (op === "upload_blob") {
      if (!local || !local._local_blob) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? "anon";
      const path = `${userId}/${local.item_id}/${row_id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, local._local_blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("item_photos").insert({
        id: row_id,
        item_id: local.item_id,
        storage_path: path,
        display_order: local.display_order,
        created_at: local.created_at,
      });
      if (insErr && insErr.code !== "23505") throw insErr;
      // Keep the bytes as the offline copy so we never re-download our own photo.
      await cachePhotoBlob(path, local._local_blob);
      await db().item_photos.update(row_id, { storage_path: path, _local_blob: null, _dirty: 0 });
    } else if (op === "delete") {
      const path = ((payload.storage_path as string | null | undefined) ?? local?.storage_path) || null;
      if (path) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        await db().photo_cache.delete(path);
      }
      const { error } = await supabase.from("item_photos").delete().eq("id", row_id);
      if (error) throw error;
      await db().item_photos.delete(row_id);
    }
  } else if (table === "rooms") {
    if (op === "insert") {
      const local = await db().rooms.get(row_id);
      if (!local) return;
      const { error } = await supabase.from("rooms").insert({
        id: local.id,
        name: local.name,
        created_at: local.created_at,
      });
      if (error && error.code === "23505" && !isPkeyConflict(error)) {
        // Same room name already exists on the server (created by the other
        // person): adopt the server's row instead of ours.
        const { data } = await supabase.from("rooms").select("*").eq("name", local.name).maybeSingle();
        await db().rooms.delete(row_id);
        if (data) await db().rooms.put({ ...(data as RoomRow), _dirty: 0 });
        return;
      }
      if (error && !isPkeyConflict(error)) throw error;
      await db().rooms.update(row_id, { _dirty: 0 });
    } else if (op === "delete") {
      const { error } = await supabase.from("rooms").delete().eq("id", row_id);
      if (error) throw error;
      await db().rooms.delete(row_id);
    }
  }
}

export async function enqueue(entry: Omit<OutboxEntry, "seq" | "attempts" | "created_at">) {
  await db().outbox.add({
    ...entry,
    attempts: 0,
    created_at: new Date().toISOString(),
  });
  if (typeof window !== "undefined" && navigator.onLine) {
    window.dispatchEvent(new CustomEvent("trigger-sync"));
  }
}

// ---------------------------------------------------------------------------
// Stuck-change management (UI)
// ---------------------------------------------------------------------------

export interface StuckChange {
  seq: number;
  description: string;
  error: string;
  failed: boolean;
  attempts: number;
}

/**
 * Outbox entries the server has rejected at least once, described for humans.
 * Changes merely waiting for a connection aren't listed.
 */
export async function listStuckChanges(): Promise<StuckChange[]> {
  const entries = (await db().outbox.orderBy("seq").toArray()).filter(
    (e) => e.last_error && (e.failed === 1 || e.attempts > 0),
  );
  const out: StuckChange[] = [];
  for (const e of entries) {
    out.push({
      seq: e.seq!,
      description: await describeEntry(e),
      error: e.last_error ?? "",
      failed: e.failed === 1,
      attempts: e.attempts,
    });
  }
  return out;
}

async function describeEntry(e: OutboxEntry): Promise<string> {
  const verb = { insert: "Add", update: "Edit", delete: "Delete", upload_blob: "Upload photo for" }[e.op] ?? e.op;
  if (e.table === "boxes") {
    const box = await db().boxes.get(e.row_id);
    return `${verb} box ${box?.number ?? "?"}`;
  }
  if (e.table === "items") {
    const item = await db().items.get(e.row_id);
    return `${verb} item "${item?.name ?? (e.payload.name as string | undefined) ?? "?"}"`;
  }
  if (e.table === "item_photos") {
    const photo = await db().item_photos.get(e.row_id);
    const item = photo ? await db().items.get(photo.item_id) : undefined;
    return e.op === "upload_blob" ? `${verb} "${item?.name ?? "item"}"` : `${verb} photo`;
  }
  const room = await db().rooms.get(e.row_id);
  return `${verb} room "${room?.name ?? "?"}"`;
}

/** Clear backoff / failed state so the entry is tried on the next sync. */
export async function retryChange(seq: number) {
  await db().outbox.update(seq, { failed: 0, next_attempt_at: 0 });
}

/**
 * Throw away a change that can't sync, then re-download from the server so
 * this device matches what's actually stored. Discarding an insert also drops
 * queued changes for its children (items in the box, photos of the item).
 */
export async function discardChange(seq: number) {
  const entry = await db().outbox.get(seq);
  if (!entry) return;

  const toDrop = new Set<number>([seq]);
  if (entry.op === "insert") {
    const all = await db().outbox.toArray();
    const dropRow = (table: Table, id: string) => {
      for (const e of all) if (e.table === table && e.row_id === id && e.seq != null) toDrop.add(e.seq);
    };
    dropRow(entry.table, entry.row_id);
    if (entry.table === "boxes") {
      const items = await db().items.where("box_id").equals(entry.row_id).toArray();
      for (const item of items) {
        dropRow("items", item.id);
        for (const p of await db().item_photos.where("item_id").equals(item.id).toArray()) dropRow("item_photos", p.id);
      }
    } else if (entry.table === "items") {
      for (const p of await db().item_photos.where("item_id").equals(entry.row_id).toArray()) {
        dropRow("item_photos", p.id);
      }
    }
  }
  await db().outbox.bulkDelete([...toDrop]);
  await primeFromServer();
}
