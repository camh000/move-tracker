"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Package, ChevronRight } from "lucide-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { searchInventory } from "@/lib/repo/search";
import { ItemPhoto } from "@/components/items/item-photo";
import { BoxTagChips } from "@/components/boxes/box-tags";
import { boxHref, itemHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function SearchView() {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(t);
  }, [q]);

  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchInventory(debounced),
    enabled: debounced.trim().length > 0,
    placeholderData: keepPreviousData,
  });
  const hasQuery = debounced.trim().length > 0;
  const boxes = hasQuery ? (data?.boxes ?? []) : [];
  const items = hasQuery ? (data?.items ?? []) : [];

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Search</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Item, room or box number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10"
          inputMode="search"
          type="search"
          autoFocus
        />
      </div>

      {boxes.length > 0 && (
        <ul className="mt-5 space-y-2">
          {boxes.map((box) => (
            <li key={box.id}>
              <Link
                href={boxHref(box.id)}
                className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 active:bg-accent"
              >
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Package className="h-4 w-4" />
                  <span className="text-lg font-bold leading-none tabular-nums">{box.number}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Box {box.number}</div>
                  <div className="text-sm text-muted-foreground">{box.destination_room}</div>
                  <BoxTagChips box={box} className="mt-1" />
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <p className="mt-5 text-xs text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"}
        </p>
      )}
      <ul className="mt-2 space-y-2 pb-4">
        {items.map(({ item, box, photo }) => (
          <li key={item.id}>
            <Link
              href={itemHref(item.id)}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 active:bg-accent"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {photo ? <ItemPhoto photo={photo} className="h-full w-full object-cover" alt={item.name} /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("truncate font-medium", item.unpacked && "text-muted-foreground line-through")}>
                  {item.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  {box ? (
                    <>
                      <span className="font-semibold text-foreground">Box {box.number}</span> · {box.destination_room}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {hasQuery && data && boxes.length === 0 && items.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No results for &quot;{debounced}&quot;.</p>
      )}
    </div>
  );
}
