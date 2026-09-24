"use client";

import { Star, Wine, Weight } from "lucide-react";
import type { BoxRow } from "@/lib/db/dexie";
import { cn } from "@/lib/utils";

export const BOX_TAGS = [
  { key: "open_first", label: "Open first", icon: Star, className: "border-primary/40 bg-primary/10 text-primary" },
  { key: "fragile", label: "Fragile", icon: Wine, className: "border-destructive/40 bg-destructive/10 text-destructive" },
  { key: "heavy", label: "Heavy", icon: Weight, className: "border-warning/60 bg-warning/15 text-foreground" },
] as const;

export type BoxTagKey = (typeof BOX_TAGS)[number]["key"];

/** Read-only chips for a box's tags. */
export function BoxTagChips({ box, className }: { box: BoxRow; className?: string }) {
  const active = BOX_TAGS.filter((t) => box[t.key]);
  if (!active.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {active.map(({ key, label, icon: Icon, className: tone }) => (
        <span
          key={key}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", tone)}
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Toggleable tag chips (box detail, new box). */
export function BoxTagToggles({
  value,
  onToggle,
}: {
  value: Partial<Record<BoxTagKey, boolean | undefined>>;
  onToggle: (key: BoxTagKey, next: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {BOX_TAGS.map(({ key, label, icon: Icon, className: tone }) => {
        const on = !!value[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(key, !on)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
              on ? tone : "border-border text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
