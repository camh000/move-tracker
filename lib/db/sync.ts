import { db, type BoxRow, type ItemRow, type ItemPhotoRow, type RoomRow, type OutboxEntry } from "./dexie";
import { createClient } from "@/lib/supabase/client";

const META_LAST_SYNC = "last_sync_at";
const META_LAST_RECONCILE = "last_reconcile_at";
const STORAGE_BUCKET = "item-photos";
const RECONCILE_INTERVAL_MS = 10 * 60 * 1000;

interface SyncResult {
  pending: number;
  lastSyncAt: number | null;
  changed: boolean;
}

let inFlight: Promise<SyncResult> | null = null;

export async function runSync(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const drained = await drainOutbox();
      const pulled = await deltaPull();
      const reconciled = await maybeReconcile();
      const pending = await db().outbox.count();
      const lastSyncAt = ((await db().meta.get(META_LAST_SYNC))?.value as number | undefined) ?? null;
      return { pending, lastSyncAt, changed: drained || pulled || reconciled };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function maybeReconcile(): Promise<boolean> {
  const last = ((await db().meta.get(META_LAST_RECONCILE))?.value as number | undefined) ?? 0;
  if (Date.now() - last < RECONCILE_INTERVAL_MS) return false;
  return reconcileWithServer();
}

export async function reconcileWithServer(): Promise<boolean> {
  const supabase = createClient();
  const [boxesRes, itemsRes, photosRes, roomsRes] = await Promise.all([
    supabase.from("boxes").select("id"),
    supabase.from("items").select("id"),
    supabase.from("item_photos").select("id"),
    supabase.from("rooms").select("id"),
  ]);

  if (boxesRes.error) throw boxesRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (photosRes.error) throw photosRes.error;
  if (roomsRes.error) throw roomsRes.error;

  const serverBoxes = new Set((boxesRes.data ?? []).map((r) => r.id as string));
  const serverItems = new Set((itemsRes.data ?? []).map((r) => r.id as string));
  const serverPhotos = new Set((photosRes.data ?? []).map((r) => r.id as string));
  const serverRooms = new Set((roomsRes.data ?? []).map((r) => r.id as string));

  let removed = 0;

  await db().transaction(
    "rw",
    [db().boxes, db().items, db().item_photos, db().rooms, db().meta],
    async () => {
      const localBoxes = await db().boxes.toArray();
      for (const row of localBoxes) {
        if (row._dirty === 1) continue;
        if (!serverBoxes.has(row.id)) {
          await db().boxes.delete(row.id);
          removed++;
        }
      }
      const localItems = await db().items.toArray();
      for (const row of localItems) {
        if (row._dirty === 1) continue;
        if (!serverItems.has(row.id)) {
          await db().items.delete(row.id);
          removed++;
        }
      }
      const localPhotos = await db().item_photos.toArray();
      for (const row of localPhotos) {
        if (row._dirty === 1) continue;
        if (!serverPhotos.has(row.id)) {
          await db().item_photos.delete(row.id);
          removed++;
        }
      }
      const localRooms = await db().rooms.toArray();
      for (const row of localRooms) {
        if (row._dirty === 1) continue;
        if (!serverRooms.has(row.id)) {
          await db().rooms.delete(row.id);
          removed++;
        }
      }
      await db().meta.put({ key: META_LAST_RECONCILE, value: Date.now() });
    },
  );

  return removed > 0;
}

export async function primeFromServer(): Promise<void> {
  const supabase = createClient();
  const [boxesRes, itemsRes, photosRes, roomsRes] = await Promise.all([
    supabase.from("boxes").select("*"),
    supabase.from("items").select("*"),
    supabase.from("item_photos").select("*"),
    supabase.from("rooms").select("*"),
  ]);

  if (boxesRes.error) throw boxesRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (photosRes.error) throw photosRes.error;
  if (roomsRes.error) throw roomsRes.error;

  await db().transaction("rw", [db().boxes, db().items, db().item_photos, db().rooms, db().meta], async () => {
    if (boxesRes.data) await db().boxes.bulkPut(boxesRes.data.map(stripServerOnly) as BoxRow[]);
    if (itemsRes.data) await db().items.bulkPut(itemsRes.data.map(stripServerOnly) as ItemRow[]);
    if (photosRes.data) await db().item_photos.bulkPut(photosRes.data.map(stripServerOnly) as ItemPhotoRow[]);
    if (roomsRes.data) await db().rooms.bulkPut(roomsRes.data as RoomRow[]);
    await db().meta.put({ key: META_LAST_SYNC, value: Date.now() });
  });
}

function stripServerOnly<T extends Record<string, unknown>>(row: T): T {
  const { search_vector, ...rest } = row as Record<string, unknown>;
  return rest as T;
}

async function deltaPull(): Promise<boolean> {
  const supabase = createClient();
  const lastSync = ((await db().meta.get(META_LAST_SYNC))?.value as number | undefined) ?? 0;
  const since = new Date(lastSync).toISOString();

  const [boxesRes, itemsRes, photosRes, roomsRes] = await Promise.all([
    supabase.from("boxes").select("*").gt("updated_at", since),
    supabase.from("items").select("*").gt("updated_at", since),
    supabase.from("item_photos").select("*").gt("created_at", since),
    supabase.from("rooms").select("*").gt("created_at", since),
  ]);

  if (boxesRes.error) throw boxesRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (photosRes.error) throw photosRes.error;
  if (roomsRes.error) throw roomsRes.error;

  let changed = false;

  await db().transaction("rw", [db().boxes, db().items, db().item_photos, db().rooms, db().meta], async () => {
    if (boxesRes.data?.length) {
      changed = true;
      for (const row of boxesRes.data) {
        const local = await db().boxes.get(row.id);
        if (!local || (local._dirty !== 1 && (local.updated_at < row.updated_at))) {
          await db().boxes.put(stripServerOnly(row) as BoxRow);
        }
      }
    }
    if (itemsRes.data?.length) {
      changed = true;
      for (const row of itemsRes.data) {
        const local = await db().items.get(row.id);
        if (!local || (local._dirty !== 1 && (local.updated_at < row.updated_at))) {
          await db().items.put(stripServerOnly(row) as ItemRow);
        }
      }
    }
    if (photosRes.data?.length) {
      changed = true;
      for (const row of photosRes.data) {
        const local = await db().item_photos.get(row.id);
        if (!local || local._dirty !== 1) {
          await db().item_photos.put(stripServerOnly(row) as ItemPhotoRow);
        }
      }
    }
    if (roomsRes.data?.length) {
      changed = true;
      await db().rooms.bulkPut(roomsRes.data as RoomRow[]);
    }
    await db().meta.put({ key: META_LAST_SYNC, value: Date.now() });
  });

  return changed;
}

async function drainOutbox(): Promise<boolean> {
  const supabase = createClient();
  const entries = await db().outbox.orderBy("seq").toArray();
  if (!entries.length) return false;

  let processed = 0;
  for (const entry of entries) {
    try {
      await processEntry(entry, supabase);
      if (entry.seq != null) await db().outbox.delete(entry.seq);
      processed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown sync error";
      if (entry.seq != null) {
        await db().outbox.update(entry.seq, {
          attempts: entry.attempts + 1,
          last_error: message,
        });
      }
      // Stop draining on first failure to preserve order
      throw err;
    }
  }
  return processed > 0;
}

async function processEntry(
  entry: OutboxEntry,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { table, op, row_id } = entry;
  const payload = entry.payload as Record<string, any>;

  if (table === "boxes") {
    if (op === "insert") {
      let attempts = 0;
      while (attempts < 5) {
        const local = await db().boxes.get(row_id);
        if (!local) return;
        const { _dirty, _deleted, ...clean } = local;
        const { error } = await supabase.from("boxes").insert(clean);
        if (!error) {
          await db().boxes.update(row_id, { _dirty: 0 });
          return;
        }
        // 23505 = unique violation (number collision)
        if (error.code === "23505" && /number/i.test(error.message)) {
          const { data: maxRows } = await supabase
            .from("boxes")
            .select("number")
            .order("number", { ascending: false })
            .limit(1);
          const nextNumber = (maxRows?.[0]?.number ?? 0) + 1 + attempts;
          const oldNumber = local.number;
          await db().boxes.update(row_id, { number: nextNumber });
          // Notify UI via custom event
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("box-renumbered", { detail: { from: oldNumber, to: nextNumber, id: row_id } }),
            );
          }
          attempts++;
          continue;
        }
        throw error;
      }
      throw new Error("Box renumber retries exhausted");
    } else if (op === "update") {
      const { error } = await supabase
        .from("boxes")
        .update({
          destination_room: payload.destination_room,
          notes: payload.notes,
          sealed: payload.sealed,
          updated_at: payload.updated_at,
        })
        .eq("id", row_id);
      if (error) throw error;
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
      const { _dirty, _deleted, ...clean } = local;
      const { error } = await supabase.from("items").insert(clean);
      if (error) throw error;
      await db().items.update(row_id, { _dirty: 0 });
    } else if (op === "update") {
      const { error } = await supabase
        .from("items")
        .update({
          name: payload.name,
          description: payload.description,
          box_id: payload.box_id,
          updated_at: payload.updated_at,
        })
        .eq("id", row_id);
      if (error) throw error;
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
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? "anon";
      const path = `${userId}/${local.item_id}/${row_id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, local._local_blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase
        .from("item_photos")
        .insert({
          id: row_id,
          item_id: local.item_id,
          storage_path: path,
          display_order: local.display_order,
          created_at: local.created_at,
        });
      if (insErr && insErr.code !== "23505") throw insErr;
      await db().item_photos.update(row_id, { storage_path: path, _local_blob: null, _dirty: 0 });
    } else if (op === "delete") {
      const path = (payload.storage_path ?? local?.storage_path) || null;
      if (path) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
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
      if (error && error.code !== "23505") throw error;
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
