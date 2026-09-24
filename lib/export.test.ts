import { beforeEach, expect, it } from "vitest";
import { resetWorld } from "@/test/setup";
import { buildInventoryCsv } from "@/lib/export";
import { createBox } from "@/lib/repo/boxes";
import { createItem } from "@/lib/repo/items";

beforeEach(() => resetWorld());

it("builds one row per item plus empty boxes, sorted by box number", async () => {
  const kitchen = await createBox({ destination_room: "Kitchen", fragile: true, notes: 'Mugs, "good" glasses' }, "a");
  await createBox({ destination_room: "Loft" }, "a");
  await createItem({ box_id: kitchen.id, name: "Toaster" }, "a");
  await createItem({ box_id: kitchen.id, name: "=SUM(A1)", description: "line1\nline2" }, "a");

  const csv = await buildInventoryCsv();
  expect(csv.startsWith("﻿Box,Room,")).toBe(true);
  const lines = csv.trim().split("\r\n");
  expect(lines).toHaveLength(4); // header + 2 items + empty Loft box
  // Quotes/commas escaped, formula neutralised, newline kept inside quotes.
  expect(csv).toContain('"Mugs, ""good"" glasses"');
  expect(csv).toContain("'=SUM(A1)");
  expect(csv).toContain('"line1\nline2"');
  expect(lines[lines.length - 1]).toMatch(/^2,Loft,/);
  expect(lines[1]).toMatch(/^1,Kitchen,no,yes,no,/);
});
