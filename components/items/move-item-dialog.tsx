"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { listBoxes } from "@/lib/repo/boxes";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBoxId: string;
  onPick: (boxId: string, boxNumber: number) => void;
}

export function MoveItemDialog({ open, onOpenChange, currentBoxId, onPick }: Props) {
  const [q, setQ] = React.useState("");
  const { data: boxes } = useQuery({ queryKey: ["boxes"], queryFn: () => listBoxes(), enabled: open });

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^box\s*/, "");
    return (boxes ?? [])
      .filter((b) => b.id !== currentBoxId)
      .filter((b) => !term || String(b.number).startsWith(term) || b.destination_room.toLowerCase().includes(term))
      .sort((a, b) => a.number - b.number);
  }, [boxes, q, currentBoxId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Move to another box</DialogTitle>
          <DialogDescription>Pick the box this item is actually in.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Box number or room"
            inputMode="search"
            className="pl-9"
          />
        </div>
        <ul className="-mx-1 max-h-[50svh] space-y-1 overflow-y-auto px-1">
          {filtered.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onPick(b.id, b.number)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left active:bg-accent",
                )}
              >
                <span className="w-10 text-xl font-bold tabular-nums">{b.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{b.destination_room}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
                    {b.sealed ? " · sealed" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">No other boxes match.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
