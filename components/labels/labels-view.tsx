"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { listBoxes, type BoxWithItemCount } from "@/lib/repo/boxes";
import { Button } from "@/components/ui/button";
import { boxHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Size = "large" | "small";

export function LabelsView() {
  return (
    <React.Suspense>
      <Labels />
    </React.Suspense>
  );
}

function Labels() {
  const params = useSearchParams();
  const { data: boxes } = useQuery({ queryKey: ["boxes"], queryFn: () => listBoxes() });
  const sorted = React.useMemo(() => [...(boxes ?? [])].sort((a, b) => a.number - b.number), [boxes]);

  const initialIds = params.get("ids");
  const [selected, setSelected] = React.useState<Set<string> | null>(
    initialIds ? new Set(initialIds.split(",")) : null,
  );
  const [size, setSize] = React.useState<Size>("large");
  // null selection = everything
  const isSelected = (id: string) => selected === null || selected.has(id);
  const chosen = sorted.filter((b) => isSelected(b.id));

  const toggle = (id: string) => {
    const next = new Set(selected ?? sorted.map((b) => b.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-4 print:max-w-none print:p-0">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Box labels</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Print and stick one on each box. Scanning the QR code with a phone camera opens that box in the app.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["large", "Large · 2 per page"],
              ["small", "Small · 6 per page"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSize(key)}
              className={cn(
                "rounded-md py-1.5 font-medium",
                size === key ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {chosen.length} of {sorted.length} selected
          </span>
          <span className="flex gap-3">
            <button type="button" className="text-primary" onClick={() => setSelected(null)}>
              All
            </button>
            <button type="button" className="text-primary" onClick={() => setSelected(new Set())}>
              None
            </button>
          </span>
        </div>
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border p-2">
          {sorted.map((b) => (
            <li key={b.id}>
              <label className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={isSelected(b.id)} onChange={() => toggle(b.id)} />
                <b className="w-8 tabular-nums">{b.number}</b>
                <span className="truncate text-muted-foreground">{b.destination_room}</span>
              </label>
            </li>
          ))}
        </ul>

        <Button className="mt-4 w-full" size="lg" onClick={() => window.print()} disabled={!chosen.length}>
          <Printer className="h-4 w-4" />
          Print {chosen.length} label{chosen.length === 1 ? "" : "s"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Preview below. On a phone, use the share sheet&apos;s Print option or save as PDF.
        </p>
      </div>

      <div
        className={cn(
          "mt-6 grid gap-3 pb-8 print:mt-0 print:gap-0 print:pb-0",
          size === "large" ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        {chosen.map((b) => (
          <Label key={b.id} box={b} size={size} />
        ))}
      </div>
    </div>
  );
}

function Label({ box, size }: { box: BoxWithItemCount; size: Size }) {
  const [svg, setSvg] = React.useState<string>("");
  React.useEffect(() => {
    const url = `${window.location.origin}${boxHref(box.id)}`;
    void QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(setSvg);
  }, [box.id]);

  const tags = [box.open_first && "OPEN FIRST", box.fragile && "FRAGILE", box.heavy && "HEAVY"].filter(Boolean);
  const large = size === "large";

  return (
    <div
      className={cn(
        "flex break-inside-avoid flex-col justify-between rounded-xl border-2 border-black bg-white p-4 text-black",
        "print:rounded-none print:border-dashed",
        large ? "aspect-[297/200] print:h-[138mm] print:aspect-auto" : "aspect-[4/3] print:h-[90mm] print:aspect-auto",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("font-semibold uppercase tracking-widest", large ? "text-base" : "text-[10px]")}>Box</div>
          <div className={cn("font-black leading-none tabular-nums", large ? "text-[9rem]" : "text-6xl")}>
            {box.number}
          </div>
        </div>
        <div
          className={cn("shrink-0", large ? "h-36 w-36" : "h-20 w-20")}
          // Output of the qrcode library (an SVG we generated from our own URL).
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div>
        <div className={cn("font-bold uppercase", large ? "text-4xl" : "text-lg")}>{box.destination_room}</div>
        {tags.length > 0 && (
          <div className={cn("mt-2 flex flex-wrap gap-2", large ? "text-xl" : "text-[10px]")}>
            {tags.map((t) => (
              <span key={t as string} className="rounded border-2 border-black px-2 py-0.5 font-black">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
