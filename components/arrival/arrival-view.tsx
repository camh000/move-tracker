"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, PartyPopper, Truck } from "lucide-react";
import { toast } from "sonner";
import { listBoxes, updateBox, type BoxWithItemCount } from "@/lib/repo/boxes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BoxTagChips } from "@/components/boxes/box-tags";
import { boxHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Filter = "missing" | "arrived" | "all";

export function ArrivalView() {
  const queryClient = useQueryClient();
  const { data: boxes } = useQuery({ queryKey: ["boxes"], queryFn: () => listBoxes() });
  const [filter, setFilter] = React.useState<Filter>("missing");
  const [number, setNumber] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const all = React.useMemo(() => [...(boxes ?? [])].sort((a, b) => a.number - b.number), [boxes]);
  const arrivedCount = all.filter((b) => b.arrived).length;
  const missing = all.length - arrivedCount;

  const visible = all.filter((b) =>
    filter === "missing" ? !b.arrived : filter === "arrived" ? b.arrived : true,
  );

  const setArrived = async (box: BoxWithItemCount, arrived: boolean) => {
    await updateBox(box.id, arrived ? { arrived } : { arrived, unpacked: false });
    await queryClient.invalidateQueries({ queryKey: ["boxes"] });
    void queryClient.invalidateQueries({ queryKey: ["box", box.id] });
  };

  const onQuickMark = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(number.trim());
    if (!Number.isInteger(n) || n <= 0) return;
    const box = all.find((b) => b.number === n);
    if (!box) {
      toast.error(`There's no box ${n}`);
    } else if (box.arrived) {
      toast.info(`Box ${n} is already ticked off`);
    } else {
      await setArrived(box, true);
      toast.success(`Box ${n} arrived`, {
        description: `${box.destination_room}${box.open_first ? " · open first" : ""}`,
      });
    }
    setNumber("");
    inputRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">Arrival checklist</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tick boxes off as they come off the van. Scanning a box&apos;s label opens it so you can tick it there too.
      </p>

      <div className="mt-4 rounded-2xl border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-bold tabular-nums">
            {arrivedCount}
            <span className="text-lg font-medium text-muted-foreground">/{all.length}</span>
          </span>
          <span className={cn("text-sm font-medium", missing === 0 ? "text-success" : "text-muted-foreground")}>
            {all.length === 0 ? "No boxes yet" : missing === 0 ? "All boxes here" : `${missing} still to come`}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: all.length ? `${(arrivedCount / all.length) * 100}%` : "0%" }}
          />
        </div>

        <form onSubmit={onQuickMark} className="mt-4 flex gap-2">
          <Input
            ref={inputRef}
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
            placeholder="Box number"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Box number to mark as arrived"
            className="text-lg tabular-nums"
          />
          <Button type="submit" disabled={!number}>
            <Truck className="h-4 w-4" />
            Arrived
          </Button>
        </form>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(
          [
            ["missing", `Missing (${missing})`],
            ["arrived", `Arrived (${arrivedCount})`],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-md py-1.5 font-medium transition-colors",
              filter === key ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filter === "missing" && missing === 0 && all.length > 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 text-center text-muted-foreground">
          <PartyPopper className="h-8 w-8 text-success" />
          <p className="font-medium text-foreground">Every box has arrived.</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2 pb-4">
          {visible.map((b) => (
            <li key={b.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => void setArrived(b, !b.arrived)}
                aria-pressed={!!b.arrived}
                aria-label={`${b.arrived ? "Unmark" : "Mark"} box ${b.number} arrived`}
                className={cn(
                  "flex w-14 shrink-0 items-center justify-center rounded-xl border-2 transition-colors",
                  b.arrived ? "border-success bg-success text-success-foreground" : "border-border",
                )}
              >
                {b.arrived && <Check className="h-6 w-6" />}
              </button>
              <Link
                href={boxHref(b.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-card p-3 active:bg-accent"
              >
                <span className="w-10 text-2xl font-bold tabular-nums">{b.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{b.destination_room}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.itemCount} item{b.itemCount === 1 ? "" : "s"}
                    {b.unpacked ? " · unpacked" : ""}
                  </span>
                  <BoxTagChips box={b} className="mt-1" />
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
