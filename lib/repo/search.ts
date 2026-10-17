import { db, type BoxRow, type ItemRow, type ItemPhotoRow } from "@/lib/db/dexie";
import { MATCH, matchWord, relatedTerms } from "@/lib/search/synonyms";

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
 * somewhere: as typed (substring, so "ket" finds "Kettle"), via a related
 * word ("puzzle" finds "Jigsaw", see lib/search/synonyms.ts), or, for a word
 * that finds nothing at all otherwise, allowing a small typo ("kettel").
 * Items match on their own name/description plus their box's room and
 * notes; boxes match on number.
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

  const related = words.map((w) => relatedTerms(w));
  const candidates = items
    .filter((item) => item._deleted !== 1)
    .map((item) => {
      const box = boxById.get(item.box_id);
      const name = item.name.toLowerCase();
      const haystack = [name, item.description ?? "", box?.destination_room ?? "", box?.notes ?? ""]
        .join(" \n ")
        .toLowerCase();
      return { item, box, name, haystack, levels: words.map((w, i) => matchWord(w, haystack, related[i])) };
    });

  // Typo matching only for words nothing matched properly; otherwise "mugs"
  // would also turn up every "rugs".
  words.forEach((w, i) => {
    if (candidates.some((c) => c.levels[i] !== MATCH.none)) return;
    for (const c of candidates) c.levels[i] = matchWord(w, c.haystack, related[i], true);
  });

  const scored: { hit: ItemHit; score: number }[] = [];
  for (const { item, box, name, levels } of candidates) {
    if (levels.some((l) => l === MATCH.none)) continue;
    // Rank name matches first (as typed, then related, then typo), then name-prefix matches.
    let score = 0;
    words.forEach((w, i) => {
      score += levels[i] + 2 * matchWord(w, name, related[i], levels[i] === MATCH.typo);
      if (name.startsWith(w)) score += 1;
    });
    scored.push({ hit: { item, box, photo: firstPhoto.get(item.id) }, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.item.name.localeCompare(b.hit.item.name));

  return { boxes: boxHits, items: scored.slice(0, MAX_ITEMS).map((s) => s.hit) };
}
