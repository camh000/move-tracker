"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { db, type ItemRow, type ItemPhotoRow, type BoxRow } from "@/lib/db/dexie";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/hooks/use-online";
import { ItemPhoto } from "@/components/items/item-photo";

interface Hit {
  item: ItemRow;
  box: BoxRow | undefined;
  photo: ItemPhotoRow | undefined;
}

async function localSearch(q: string): Promise<Hit[]> {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const all = await db().items.toArray();
  const matches = all
    .filter((i) => i._deleted !== 1)
    .filter(
      (i) =>
        i.name.toLowerCase().includes(term) ||
        (i.description?.toLowerCase().includes(term) ?? false),
    )
    .slice(0, 100);

  const boxIds = Array.from(new Set(matches.map((m) => m.box_id)));
  const boxes = await db().boxes.bulkGet(boxIds);
  const boxMap = new Map(boxes.filter(Boolean).map((b) => [b!.id, b!]));

  const photos = await db().item_photos.toArray();
  const firstPhotoByItem = new Map<string, ItemPhotoRow>();
  for (const p of photos) {
    if (p._deleted === 1) continue;
    const cur = firstPhotoByItem.get(p.item_id);
    if (!cur || p.display_order < cur.display_order) {
      firstPhotoByItem.set(p.item_id, p);
    }
  }

  return matches.map((item) => ({
    item,
    box: boxMap.get(item.box_id),
    photo: firstPhotoByItem.get(item.id),
  }));
}

async function serverSearch(q: string): Promise<Hit[]> {
  const term = q.trim();
  if (!term) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*, item_photos(id, item_id, storage_path, display_order, created_at), boxes!items_box_id_fkey(*)")
    .textSearch("search_vector", term, { type: "websearch", config: "english" })
    .limit(50);
  if (error) {
    // fall back to local
    return localSearch(q);
  }
  return (data ?? []).map((row: any) => {
    const photos: ItemPhotoRow[] = (row.item_photos ?? []).sort(
      (a: ItemPhotoRow, b: ItemPhotoRow) => a.display_order - b.display_order,
    );
    const photo = photos[0];
    const { item_photos, boxes, ...item } = row;
    return { item: item as ItemRow, box: boxes as BoxRow, photo };
  });
}

export function SearchView() {
  const online = useOnline();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced, online],
    queryFn: () => (online ? serverSearch(debounced) : localSearch(debounced)),
    enabled: debounced.trim().length > 0,
  });

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Search</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search items"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10"
          inputMode="search"
          autoFocus
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {!online && (
        <p className="mt-3 text-xs text-muted-foreground">
          Offline — searching this device only.
        </p>
      )}

      <ul className="mt-5 space-y-2">
        {(data ?? []).map(({ item, box, photo }) => (
          <li key={item.id}>
            <Link
              href={`/item/${item.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 active:bg-accent"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {photo ? (
                  <ItemPhoto photo={photo} className="h-full w-full object-cover" alt={item.name} />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.name}</div>
                <div className="text-sm text-muted-foreground">
                  {box ? `Box ${box.number} (${box.destination_room})` : "—"}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {debounced.trim().length > 0 && !isFetching && (data ?? []).length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No items found for "{debounced}".
        </p>
      )}
    </div>
  );
}
