"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, ChevronRight, PackageOpen, Truck, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listBoxes, type BoxWithItemCount } from "@/lib/repo/boxes";
import { listRooms } from "@/lib/repo/rooms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BoxTagChips } from "@/components/boxes/box-tags";
import { useActiveBox } from "@/hooks/use-active-box";
import { addItemHref, boxHref } from "@/lib/routes";

type SortKey = "newest" | "number" | "room";
const PREFS_KEY = "movetracker.home_prefs";

function readPrefs(): { sort: SortKey; room: string } {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) return { sort: "newest", room: "", ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { sort: "newest", room: "" };
}

export function HomeView() {
  const { activeBoxId } = useActiveBox();
  const { data: boxes, isLoading } = useQuery({
    queryKey: ["boxes"],
    queryFn: () => listBoxes(),
  });
  const { data: rooms } = useQuery({ queryKey: ["rooms"], queryFn: () => listRooms() });

  const [prefs, setPrefs] = React.useState<{ sort: SortKey; room: string } | null>(null);
  React.useEffect(() => {
    // localStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readPrefs());
  }, []);
  const sort = prefs?.sort ?? "newest";
  const roomFilter = prefs?.room ?? "";
  const updatePrefs = (patch: Partial<{ sort: SortKey; room: string }>) => {
    const next = { sort, room: roomFilter, ...patch };
    setPrefs(next);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const activeBox = activeBoxId
    ? boxes?.find((b) => b.id === activeBoxId && !b.sealed && !b.arrived) ?? null
    : null;

  // Rooms in use on boxes plus configured rooms, so filters always cover every box.
  const roomOptions = React.useMemo(() => {
    const names = new Set<string>((rooms ?? []).map((r) => r.name));
    for (const b of boxes ?? []) names.add(b.destination_room);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rooms, boxes]);

  const visible = React.useMemo(() => {
    const list = (boxes ?? []).filter((b) => !roomFilter || b.destination_room === roomFilter);
    if (sort === "number" || sort === "room") return [...list].sort((a, b) => a.number - b.number);
    return list; // already newest-first
  }, [boxes, roomFilter, sort]);

  const groups = React.useMemo(() => {
    if (sort !== "room") return [{ room: null as string | null, boxes: visible }];
    const byRoom = new Map<string, BoxWithItemCount[]>();
    for (const b of visible) byRoom.set(b.destination_room, [...(byRoom.get(b.destination_room) ?? []), b]);
    return [...byRoom.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([room, list]) => ({ room: room as string | null, boxes: list }));
  }, [visible, sort]);

  const total = boxes?.length ?? 0;
  const arrived = boxes?.filter((b) => b.arrived).length ?? 0;
  const unpacked = boxes?.filter((b) => b.unpacked).length ?? 0;

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      {activeBox && (
        <Link href={addItemHref(activeBox.id)} className="mb-4 block">
          <Card className="border-primary/40 bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wider text-primary">
                  Currently packing
                </span>
                <span className="mt-1 text-lg font-semibold">Box {activeBox.number}</span>
                <span className="text-sm text-muted-foreground">{activeBox.destination_room}</span>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-3 text-sm font-medium text-primary">Add item →</div>
          </Card>
        </Link>
      )}

      {total > 0 && (arrived > 0 || unpacked > 0) && (
        <Link
          href="/arrival"
          className="mb-4 flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm"
        >
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span>
              <b className="tabular-nums">{arrived}</b>/{total} arrived ·{" "}
              <b className="tabular-nums">{unpacked}</b> unpacked
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Boxes</h1>
        <Button asChild size="sm">
          <Link href="/box/new">
            <Plus className="h-4 w-4" />
            New box
          </Link>
        </Button>
      </div>

      {total > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <select
            aria-label="Filter by room"
            value={roomFilter}
            onChange={(e) => updatePrefs({ room: e.target.value })}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All rooms</option>
            {roomOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort boxes"
            value={sort}
            onChange={(e) => updatePrefs({ sort: e.target.value as SortKey })}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="number">By box number</option>
            <option value="room">Grouped by room</option>
          </select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No boxes for {roomFilter}.
        </p>
      ) : (
        <div className="space-y-5 pb-4">
          {groups.map((g) => (
            <section key={g.room ?? "all"}>
              {g.room && (
                <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold">
                  {g.room}
                  <span className="text-xs font-normal text-muted-foreground">
                    {g.boxes.length} box{g.boxes.length === 1 ? "" : "es"}
                  </span>
                </h2>
              )}
              <ul className="space-y-3">
                {g.boxes.map((b) => (
                  <li key={b.id}>
                    <BoxCard box={b} showRoom={!g.room} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BoxCard({ box: b, showRoom }: { box: BoxWithItemCount; showRoom: boolean }) {
  return (
    <Link href={boxHref(b.id)}>
      <Card className="flex items-center justify-between gap-3 p-4 transition active:bg-accent">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold tabular-nums leading-none">{b.number}</span>
            {b.unpacked ? (
              <Badge variant="success">Unpacked</Badge>
            ) : b.arrived ? (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Arrived
              </Badge>
            ) : b.sealed ? (
              <Badge variant="secondary">Sealed</Badge>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {showRoom && <>{b.destination_room} · </>}
            {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
            {b.arrived && b.itemCount > 0 && !b.unpacked && (
              <> · {b.unpackedCount}/{b.itemCount} unpacked</>
            )}
          </div>
          <BoxTagChips box={b} />
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <PackageOpen className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-base font-semibold">No boxes yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Start by creating your first box.</p>
      </div>
      <Button asChild>
        <Link href="/box/new">
          <Plus className="h-4 w-4" />
          New box
        </Link>
      </Button>
    </div>
  );
}
