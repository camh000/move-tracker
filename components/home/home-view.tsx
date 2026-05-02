"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, ChevronRight, PackageOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listBoxes } from "@/lib/repo/boxes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveBox } from "@/hooks/use-active-box";

export function HomeView() {
  const { activeBoxId } = useActiveBox();
  const { data: boxes, isLoading } = useQuery({
    queryKey: ["boxes"],
    queryFn: () => listBoxes(),
  });

  const activeBox = activeBoxId ? boxes?.find((b) => b.id === activeBoxId) ?? null : null;

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      {activeBox && (
        <Link
          href={`/box/${activeBox.id}/add-item`}
          className="mb-4 block"
        >
          <Card className="border-primary/40 bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wider text-primary">
                  Currently packing
                </span>
                <span className="mt-1 text-lg font-semibold">
                  Box {activeBox.number}
                </span>
                <span className="text-sm text-muted-foreground">{activeBox.destination_room}</span>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-3 text-sm font-medium text-primary">
              Add item →
            </div>
          </Card>
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

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : boxes && boxes.length > 0 ? (
        <ul className="space-y-3">
          {boxes.map((b) => (
            <li key={b.id}>
              <Link href={`/box/${b.id}`}>
                <Card className="flex items-center justify-between p-4 transition active:bg-accent">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold tabular-nums leading-none">
                        {b.number}
                      </span>
                      {b.sealed && <Badge variant="secondary">Sealed</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {b.destination_room} · {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState />
      )}
    </div>
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
        <p className="mt-1 text-sm text-muted-foreground">
          Start by creating your first box.
        </p>
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
