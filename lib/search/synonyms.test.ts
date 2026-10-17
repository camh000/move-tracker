import { beforeEach, describe, expect, it } from "vitest";
import { resetWorld, setOnline, onDevice } from "@/test/setup";
import { createBox } from "@/lib/repo/boxes";
import { createItem } from "@/lib/repo/items";
import { searchInventory } from "@/lib/repo/search";
import { editDistance, MATCH, matchWord, relatedTerms, singular } from "@/lib/search/synonyms";

describe("relatedTerms", () => {
  it("is symmetric", () => {
    expect(relatedTerms("puzzle")).toContain("jigsaw");
    expect(relatedTerms("jigsaw")).toContain("puzzle");
  });
  it("handles plurals and partial words", () => {
    expect(relatedTerms("puzzles")).toContain("jigsaw");
    expect(relatedTerms("puzz")).toContain("jigsaw");
    expect(relatedTerms("hoo")).toEqual([]);
  });
});

describe("matchWord", () => {
  it("prefers what was typed, then related words, then typos", () => {
    expect(matchWord("ket", "kettle", [])).toBe(MATCH.exact);
    expect(matchWord("puzzle", "1000 piece jigsaw", relatedTerms("puzzle"))).toBe(MATCH.related);
    expect(matchWord("kettel", "kettle", [], true)).toBe(MATCH.typo);
    expect(matchWord("kettel", "kettle", [])).toBe(MATCH.none);
  });
  it("only matches related words as whole words", () => {
    expect(matchWord("suitcase", "bookcase", relatedTerms("suitcase"))).toBe(MATCH.none);
    expect(matchWord("telly", "tv stand", relatedTerms("telly"))).toBe(MATCH.related);
    expect(matchWord("telly", "tvs", relatedTerms("telly"))).toBe(MATCH.related);
  });
});

describe("helpers", () => {
  it("singular", () => {
    expect(["plates", "boxes", "batteries", "glass", "mugs"].map(singular)).toEqual([
      "plate", "box", "battery", "glass", "mug",
    ]);
  });
  it("editDistance counts a swap as one", () => {
    expect(editDistance("kettel", "kettle", 2)).toBe(1);
    expect(editDistance("duvet", "duvay", 2)).toBe(2);
  });
});

describe("searchInventory with related words", () => {
  beforeEach(() => {
    resetWorld();
    setOnline(true);
    onDevice("a");
  });

  it("finds a jigsaw when searching puzzle, and the other way round", async () => {
    const box = await createBox({ destination_room: "Loft" }, "a");
    await createItem({ box_id: box.id, name: "Jigsaw 1000 pieces" }, "a");
    await createItem({ box_id: box.id, name: "Puzzle book" }, "a");
    const names = async (q: string) => (await searchInventory(q)).items.map((h) => h.item.name);
    // What was typed ranks above the related word.
    expect(await names("puzzle")).toEqual(["Puzzle book", "Jigsaw 1000 pieces"]);
    expect(await names("jigsaws")).toEqual(["Jigsaw 1000 pieces", "Puzzle book"]);
  });

  it("covers everyday UK words", async () => {
    const box = await createBox({ destination_room: "Living Room" }, "a");
    await createItem({ box_id: box.id, name: "Henry vacuum" }, "a");
    await createItem({ box_id: box.id, name: "TV remote" }, "a");
    await createItem({ box_id: box.id, name: "Bookcase shelves" }, "a");
    expect((await searchInventory("hoover")).items.map((h) => h.item.name)).toEqual(["Henry vacuum"]);
    expect((await searchInventory("telly")).items.map((h) => h.item.name)).toEqual(["TV remote"]);
    expect((await searchInventory("suitcase")).items).toEqual([]);
  });

  it("forgives a typo only when nothing matches properly", async () => {
    const box = await createBox({ destination_room: "Kitchen" }, "a");
    await createItem({ box_id: box.id, name: "Kettle" }, "a");
    await createItem({ box_id: box.id, name: "Mugs" }, "a");
    await createItem({ box_id: box.id, name: "Rugs" }, "a");
    expect((await searchInventory("kettel")).items.map((h) => h.item.name)).toEqual(["Kettle"]);
    expect((await searchInventory("mugs")).items.map((h) => h.item.name)).toEqual(["Mugs"]);
  });
});
