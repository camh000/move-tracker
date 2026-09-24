import { db, type BoxRow, type ItemRow, type ItemPhotoRow } from "@/lib/db/dexie";

export interface ItemHit {
  item: ItemRow;
  box: BoxRow | undefined;
  photo: ItemPhotoRow | undefined;
}

export interface SearchResults {
  boxes: BoxRow[];
  items: ItemHit[];
}

const MAX_ITEMS = 200;

function tokens(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Searches this device's copy of the inventory, which is complete once synced,
 * so results are identical online and offline. Every word must match
 * somewhere (substring, so "ket" finds "Kettle"). Items match on their own
 * name/description plus their box's room and notes; boxes match on number.
 */
export async function searchInventory(q: string): Promise<SearchResults> {
  const words = tokens(q);
  if (!words.length) return { boxes: [], items: [] };

  const [boxes, items, photos] = await Promise.all([
    db().boxes.toArray(),
    db().items.toArray(),
    db().item_photos.toArray(),
  ]);
  const liveBoxes = boxes.filter((b) => b._deleted !== 1);
  const boxById = new Map(liveBoxes.map((b) => [b.id, b]));

  // "12", "#12", "box 12" → that box.
  const numberQuery = q.trim().toLowerCase().replace(/^box\s*/, "").replace(/^#/, "");
  const boxHits = /^\d+$/.test(numberQuery)
    ? liveBoxes.filter((b) => String(b.number) === numberQuery)
    : [];

  const firstPhoto = new Map<string, ItemPhotoRow>();
  for (const p of photos) {
    if (p._deleted === 1) continue;
    const cur = firstPhoto.get(p.item_id);
    if (!cur || p.display_order < cur.display_order) firstPhoto.set(p.item_id, p);
  }

  const scored: { hit: ItemHit; score: number }[] = [];
  for (const item of items) {
    if (item._deleted === 1) continue;
    const box = boxById.get(item.box_id);
    const name = item.name.toLowerCase();
    const haystack = [name, item.description ?? "", box?.destination_room ?? "", box?.notes ?? ""]
      .join(" \n ")
      .toLowerCase();
    if (!words.every((w) => haystack.includes(w))) continue;
    // Rank name matches first, then name-prefix matches.
    let score = 0;
    for (const w of words) {
      if (name.includes(w)) score += 2;
      if (name.startsWith(w)) score += 1;
    }
    scored.push({ hit: { item, box, photo: firstPhoto.get(item.id) }, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.item.name.localeCompare(b.hit.item.name));

  return { boxes: boxHits, items: scored.slice(0, MAX_ITEMS).map((s) => s.hit) };
}
