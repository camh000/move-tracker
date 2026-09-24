import { db } from "@/lib/db/dexie";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
  // Stop spreadsheet apps interpreting cells as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function download(filename: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * One row per item (plus one row for each empty box), sorted by box number.
 * Suitable for a removals-insurance inventory or opening in a spreadsheet.
 */
export async function exportInventoryCsv() {
  download(`move-inventory-${stamp()}.csv`, new Blob([await buildInventoryCsv()], { type: "text/csv;charset=utf-8" }));
}

export async function buildInventoryCsv(): Promise<string> {
  const [boxes, items, photos] = await Promise.all([
    db().boxes.toArray(),
    db().items.toArray(),
    db().item_photos.toArray(),
  ]);
  const liveBoxes = boxes.filter((b) => b._deleted !== 1).sort((a, b) => a.number - b.number);
  const photoCount = new Map<string, number>();
  for (const p of photos) {
    if (p._deleted === 1) continue;
    photoCount.set(p.item_id, (photoCount.get(p.item_id) ?? 0) + 1);
  }
  const itemsByBox = new Map<string, typeof items>();
  for (const it of items) {
    if (it._deleted === 1) continue;
    const arr = itemsByBox.get(it.box_id) ?? [];
    arr.push(it);
    itemsByBox.set(it.box_id, arr);
  }

  const rows: unknown[][] = [
    [
      "Box",
      "Room",
      "Open first",
      "Fragile",
      "Heavy",
      "Sealed",
      "Arrived",
      "Box unpacked",
      "Box notes",
      "Item",
      "Item description",
      "Item unpacked",
      "Photos",
      "Item added",
    ],
  ];
  for (const b of liveBoxes) {
    const boxCols = [
      b.number,
      b.destination_room,
      !!b.open_first,
      !!b.fragile,
      !!b.heavy,
      !!b.sealed,
      !!b.arrived,
      !!b.unpacked,
      b.notes,
    ];
    const its = (itemsByBox.get(b.id) ?? []).sort((x, y) => x.name.localeCompare(y.name));
    if (!its.length) rows.push([...boxCols, "", "", "", "", ""]);
    for (const it of its) {
      rows.push([
        ...boxCols,
        it.name,
        it.description,
        !!it.unpacked,
        photoCount.get(it.id) ?? 0,
        it.created_at.slice(0, 10),
      ]);
    }
  }
  return toCsv(rows);
}

/** Full data backup (no photo bytes) as JSON. */
export async function exportBackupJson() {
  const strip = <T extends object>(rows: T[]) =>
    rows
      .filter((r) => (r as { _deleted?: number })._deleted !== 1)
      .map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) if (!k.startsWith("_")) out[k] = v;
        return out;
      });
  const [boxes, items, item_photos, rooms] = await Promise.all([
    db().boxes.toArray(),
    db().items.toArray(),
    db().item_photos.toArray(),
    db().rooms.toArray(),
  ]);
  const backup = {
    app: "move-tracker",
    version: 1,
    exported_at: new Date().toISOString(),
    boxes: strip(boxes),
    items: strip(items),
    item_photos: strip(item_photos),
    rooms: strip(rooms),
  };
  download(
    `move-backup-${stamp()}.json`,
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
}
