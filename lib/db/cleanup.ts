import { db } from "@/lib/db/dexie";
import { reconcileWithServer } from "@/lib/db/sync";

export interface CleanupResult {
  /** Local item_photos rows whose parent item is missing or deleted. */
  localPhotos: number;
  /** Local items rows whose parent box is missing or deleted. */
  localItems: number;
  /** Local boxes that were already soft-deleted and have no pending outbox entry. */
  localBoxes: number;
  /** Storage objects removed by the server-side scan. */
  storageObjects: number;
}

/**
 * Scans for orphaned local rows (whose parent is missing / deleted) and Storage
 * objects with no matching item_photos.storage_path, and removes them.
 *
 * Safe to re-run; produces zero counts on a clean account.
 */
export async function runCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = { localPhotos: 0, localItems: 0, localBoxes: 0, storageObjects: 0 };

  // Reconcile against the server first so anything already deleted remotely
  // is removed before we hunt for orphans.
  await reconcileWithServer().catch(() => {});

  const [boxes, items, photos] = await Promise.all([
    db().boxes.toArray(),
    db().items.toArray(),
    db().item_photos.toArray(),
  ]);

  const liveBoxIds = new Set(boxes.filter((b) => b._deleted !== 1).map((b) => b.id));
  const liveItemIds = new Set(items.filter((i) => i._deleted !== 1).map((i) => i.id));

  await db().transaction("rw", [db().boxes, db().items, db().item_photos, db().outbox], async () => {
    // Photos with no live parent item.
    for (const photo of photos) {
      if (!liveItemIds.has(photo.item_id)) {
        await db().item_photos.delete(photo.id);
        result.localPhotos++;
      }
    }
    // Items with no live parent box.
    for (const item of items) {
      if (!liveBoxIds.has(item.box_id)) {
        await db().items.delete(item.id);
        result.localItems++;
      }
    }
    // Boxes already soft-deleted whose outbox delete entry is gone (already synced).
    const stuckOutboxRowIds = new Set(
      (await db().outbox.toArray()).filter((e) => e.table === "boxes").map((e) => e.row_id),
    );
    for (const box of boxes) {
      if (box._deleted === 1 && !stuckOutboxRowIds.has(box.id)) {
        await db().boxes.delete(box.id);
        result.localBoxes++;
      }
    }
  });

  // Server-side Storage orphan scan.
  try {
    const res = await fetch("/api/cleanup-storage", { method: "POST" });
    if (res.ok) {
      const json = (await res.json()) as { removed: number };
      result.storageObjects = json.removed ?? 0;
    }
  } catch {
    // Non-fatal; storage cleanup is best-effort.
  }

  return result;
}
