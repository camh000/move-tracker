import { db, type ItemPhotoRow } from "@/lib/db/dexie";
import { createClient } from "@/lib/supabase/client";

const STORAGE_BUCKET = "item-photos";
const SIGNED_TTL = 60 * 60; // 1h
const OFFLINE_PHOTOS_KEY = "movetracker.offline_photos";

/** Whether to download every photo in the background so they show offline. On by default. */
export function offlinePhotosEnabled(): boolean {
  try {
    return window.localStorage.getItem(OFFLINE_PHOTOS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setOfflinePhotosEnabled(on: boolean) {
  try {
    window.localStorage.setItem(OFFLINE_PHOTOS_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

export async function cachePhotoBlob(storagePath: string, blob: Blob) {
  await db().photo_cache.put({ storage_path: storagePath, blob, cached_at: Date.now() });
}

async function downloadPhoto(storagePath: string): Promise<Blob | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
  if (error || !data) return null;
  await cachePhotoBlob(storagePath, data);
  return data;
}

/**
 * Returns an object URL for the photo (caller must revoke it). Order of
 * preference: not-yet-uploaded local blob → offline cache → download and
 * cache → short-lived signed URL as a last resort.
 */
export async function getPhotoUrl(photo: ItemPhotoRow): Promise<{ url: string; revoke: boolean } | null> {
  if (photo._local_blob) return { url: URL.createObjectURL(photo._local_blob), revoke: true };
  if (!photo.storage_path) return null;

  const cached = await db().photo_cache.get(photo.storage_path);
  if (cached) return { url: URL.createObjectURL(cached.blob), revoke: true };

  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  const blob = await downloadPhoto(photo.storage_path);
  if (blob) return { url: URL.createObjectURL(blob), revoke: true };

  const { data } = await createClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(photo.storage_path, SIGNED_TTL);
  return data ? { url: data.signedUrl, revoke: false } : null;
}

let prefetching: Promise<number> | null = null;

/**
 * Download every uploaded photo that isn't cached yet. Runs a few downloads
 * at a time; safe to call repeatedly (concurrent calls share one run).
 */
export function prefetchAllPhotos(onProgress?: (done: number, total: number) => void): Promise<number> {
  if (prefetching) return prefetching;
  prefetching = (async () => {
    try {
      if (navigator.storage?.persist) {
        // Ask the browser not to evict our data under storage pressure.
        await navigator.storage.persist().catch(() => false);
      }
      const photos = await db().item_photos.toArray();
      const cachedPaths = new Set((await db().photo_cache.toCollection().primaryKeys()) as string[]);
      const todo = photos
        .filter((p) => p._deleted !== 1 && p.storage_path && !cachedPaths.has(p.storage_path))
        .map((p) => p.storage_path!);

      let done = 0;
      onProgress?.(0, todo.length);
      const queue = [...todo];
      const worker = async () => {
        while (queue.length && navigator.onLine) {
          const path = queue.shift()!;
          await downloadPhoto(path).catch(() => null);
          done++;
          onProgress?.(done, todo.length);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      return done;
    } finally {
      prefetching = null;
    }
  })();
  return prefetching;
}

/** Drop cached copies of photos that no longer exist. */
export async function prunePhotoCache(): Promise<number> {
  const live = new Set(
    (await db().item_photos.toArray()).filter((p) => p._deleted !== 1 && p.storage_path).map((p) => p.storage_path!),
  );
  const cached = (await db().photo_cache.toCollection().primaryKeys()) as string[];
  const stale = cached.filter((p) => !live.has(p));
  await db().photo_cache.bulkDelete(stale);
  return stale.length;
}

export async function photoCacheStats(): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  await db().photo_cache.each((row) => {
    count++;
    bytes += row.blob.size;
  });
  return { count, bytes };
}
