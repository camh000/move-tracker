import { ALL_WORDS } from "@/lib/items/vocabulary";

export interface SuggestInput {
  /** What's typed in the name field so far. */
  query: string;
  /** Names already used on this device, most-used first. */
  history: string[];
  /** Vocabulary for the box's destination room (see wordsForRoom). */
  roomWords: string[];
  /** Names to leave out (already in this box or in the pending list). Any case. */
  exclude: Iterable<string>;
  limit?: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Name suggestions for the add-item field.
 *
 * Empty query: things that usually go in this room, minus what's already in
 * the box. Otherwise: names the user has used before, then the vocabulary,
 * matched on the start of the name, then the start of any word, then anywhere.
 */
export function suggestNames({ query, history, roomWords, exclude, limit = 12 }: SuggestInput): string[] {
  const excluded = new Set(Array.from(exclude, norm));
  const q = norm(query);

  if (!q) {
    return roomWords.filter((w) => !excluded.has(norm(w))).slice(0, limit);
  }

  const roomSet = new Set(roomWords.map(norm));
  // Dedupe case-insensitively, keeping the user's own spelling over ours.
  // `order` breaks ties: usage rank for history, name length for vocabulary.
  const candidates = new Map<string, { name: string; source: number; order: number }>();
  history.forEach((name, i) => {
    const key = norm(name);
    if (key && !candidates.has(key)) candidates.set(key, { name: name.trim(), source: 0, order: i });
  });
  for (const name of ALL_WORDS) {
    const key = norm(name);
    if (!candidates.has(key)) candidates.set(key, { name, source: roomSet.has(key) ? 1 : 2, order: name.length });
  }

  const scored: { name: string; tier: number; source: number; order: number }[] = [];
  for (const [key, { name, source, order }] of candidates) {
    if (excluded.has(key)) continue;
    let tier: number;
    if (key.startsWith(q)) tier = 0;
    else if (key.split(/[\s\-/']+/).some((word) => word.startsWith(q))) tier = 1;
    else if (q.length >= 3 && key.includes(q)) tier = 2;
    else continue;
    scored.push({ name, tier, source, order });
  }
  scored.sort((a, b) => a.tier - b.tier || a.source - b.source || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.name);
}

/**
 * Splits typed or pasted text into item names: "kettle, toaster\nmugs" gives
 * three. Capitalises the first letter so names line up with the suggestions.
 */
export function parseNames(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

/** Item names from a list of item rows, most-used first. */
export function nameHistory(items: { name: string }[]): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const { name } of items) {
    const key = norm(name);
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { name: name.trim(), n: 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.n - a.n)
    .map((e) => e.name);
}
