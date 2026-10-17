import { describe, expect, it } from "vitest";
import { nameHistory, parseNames, suggestNames } from "@/lib/items/suggest";
import { wordsForRoom } from "@/lib/items/vocabulary";

describe("suggestNames", () => {
  const base = { history: [], roomWords: [], exclude: [] };

  it("suggests room items for an empty query, minus what's already in the box", () => {
    const roomWords = wordsForRoom("Kitchen");
    const out = suggestNames({ ...base, query: "", roomWords, exclude: ["kettle"] });
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain("Kettle");
    expect(out).toContain("Toaster");
  });

  it("matches the start of the name before the start of a later word", () => {
    const out = suggestNames({ ...base, query: "ket" });
    expect(out[0]).toBe("Kettle");
    const mix = suggestNames({ ...base, query: "mix" });
    expect(mix.indexOf("Mixing bowls")).toBeLessThan(mix.indexOf("Stand mixer"));
  });

  it("puts the user's own names first and keeps their spelling", () => {
    const out = suggestNames({ ...base, query: "ket", history: ["kettle (the good one)", "KETTLE"] });
    expect(out[0]).toBe("kettle (the good one)");
    expect(out).toContain("KETTLE");
    expect(out).not.toContain("Kettle");
  });

  it("prefers this room's items among equal matches", () => {
    const out = suggestNames({ ...base, query: "s", roomWords: wordsForRoom("Bathroom") });
    expect(wordsForRoom("Bathroom")).toContain(out[0]);
  });

  it("only matches mid-word for 3+ characters", () => {
    expect(suggestNames({ ...base, query: "et" })).not.toContain("Kettle");
    expect(suggestNames({ ...base, query: "ett" })).toContain("Kettle");
  });
});

describe("wordsForRoom", () => {
  it("maps the default rooms to something", () => {
    for (const room of ["Kitchen", "Living Room", "Master Bedroom", "Bedroom 2", "Bathroom", "Office", "Garage", "Loft", "Hallway", "Dining Room", "Outhouse"]) {
      expect(wordsForRoom(room).length, room).toBeGreaterThan(0);
    }
    expect(wordsForRoom("Other")).toEqual([]);
  });
});

describe("parseNames", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseNames("kettle, toaster;\n mugs ,, ")).toEqual(["Kettle", "Toaster", "Mugs"]);
  });
  it("collapses whitespace", () => {
    expect(parseNames("  phone   charger ")).toEqual(["Phone charger"]);
  });
});

describe("nameHistory", () => {
  it("orders by use and dedupes case-insensitively", () => {
    expect(nameHistory([{ name: "Mugs" }, { name: "Kettle" }, { name: "mugs" }])).toEqual(["Mugs", "Kettle"]);
  });
});
