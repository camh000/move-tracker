/**
 * Words that should find each other in search: "puzzle" finds "Jigsaw",
 * "hoover" finds "Vacuum cleaner". Each group is symmetric. Keep groups
 * tight; a word that means two different things (e.g. "glasses") is better
 * left out than made to match the wrong half.
 */
export const SYNONYM_GROUPS: string[][] = [
  // games, toys, hobbies
  ["jigsaw", "puzzle"],
  ["board game", "boardgame", "game"],
  ["lego", "building blocks", "bricks"],
  ["teddy", "soft toy", "plush", "cuddly toy", "stuffed animal"],
  ["playstation", "ps4", "ps5", "xbox", "nintendo", "switch", "console"],
  ["controller", "joypad", "gamepad"],
  ["record", "vinyl", "lp"],
  ["dvd", "blu-ray", "bluray", "film", "movie"],
  ["book", "novel", "paperback", "hardback"],
  ["magazine", "mag", "comic"],
  ["paint", "paints", "art supplies", "craft"],
  ["knitting", "wool", "yarn"],
  ["sewing kit", "needles", "thread"],
  // electronics
  ["tv", "telly", "television"],
  ["remote", "clicker", "zapper"],
  ["laptop", "notebook computer", "macbook", "chromebook"],
  ["computer", "pc", "desktop"],
  ["monitor", "screen", "display"],
  ["phone", "mobile", "iphone", "smartphone"],
  ["tablet", "ipad"],
  ["kindle", "e-reader", "ereader"],
  ["charger", "charging cable", "power adapter", "plug"],
  ["cable", "lead", "wire", "cord"],
  ["extension lead", "extension cable", "power strip", "multi plug"],
  ["headphones", "earphones", "earbuds", "airpods", "headset"],
  ["speaker", "bluetooth speaker", "soundbar", "sonos"],
  ["router", "wifi", "modem", "broadband"],
  ["hard drive", "external drive", "hdd", "ssd"],
  ["usb stick", "memory stick", "flash drive", "thumb drive"],
  ["camera", "dslr", "gopro"],
  ["battery", "batteries"],
  ["power bank", "battery pack"],
  ["torch", "flashlight"],
  ["light bulb", "bulb", "lightbulb"],
  ["lamp", "light"],
  // kitchen
  ["crockery", "plate", "bowl", "dish", "dinnerware"],
  ["cutlery", "fork", "knife", "spoon", "silverware", "flatware"],
  ["mug", "cup"],
  ["pan", "saucepan", "pot", "frying pan", "skillet", "wok"],
  ["baking tray", "oven tray", "baking sheet", "roasting tin"],
  ["tupperware", "food container", "lunch box", "storage container"],
  ["tea towel", "dish towel", "dish cloth"],
  ["oven glove", "oven mitt"],
  ["cafetiere", "cafetière", "french press"],
  ["coffee machine", "coffee maker", "espresso machine", "nespresso"],
  ["food processor", "blender", "liquidiser", "nutribullet"],
  ["mixer", "kitchenaid", "stand mixer", "whisk"],
  ["slow cooker", "crockpot", "crock pot"],
  ["air fryer", "airfryer"],
  ["toastie maker", "sandwich toaster", "sandwich maker"],
  ["tin opener", "can opener"],
  ["sieve", "colander", "strainer"],
  ["chopping board", "cutting board"],
  ["scales", "weighing scales"],
  ["spices", "herbs", "seasoning"],
  ["tins", "cans", "canned food", "tinned food"],
  ["bin", "rubbish bin", "trash can", "waste bin", "dustbin"],
  ["fridge", "refrigerator"],
  ["freezer", "chest freezer"],
  // cleaning, laundry
  ["hoover", "vacuum", "dyson", "henry"],
  ["mop", "mop and bucket", "bucket"],
  ["dustpan", "dustpan and brush", "brush"],
  ["cleaning products", "cleaning supplies", "bleach", "detergent", "spray"],
  ["washing powder", "laundry detergent", "washing liquid"],
  ["clothes horse", "clothes airer", "drying rack", "airer"],
  ["iron", "steamer"],
  ["laundry basket", "washing basket", "hamper"],
  // bedroom, clothes, textiles
  ["duvet", "quilt", "comforter", "doona"],
  ["bedding", "bed linen", "sheets", "bedsheets"],
  ["pillow", "cushion"],
  ["throw", "blanket"],
  ["towel", "bath towel", "bath sheet"],
  ["clothes", "clothing", "garments"],
  ["jumper", "sweater", "pullover", "sweatshirt", "hoodie", "cardigan"],
  ["trousers", "jeans", "chinos", "joggers"],
  ["t-shirt", "tshirt", "tee"],
  ["coat", "jacket", "anorak", "parka", "raincoat"],
  ["trainers", "sneakers", "running shoes"],
  ["shoes", "footwear", "boots", "trainers", "sandals", "heels"],
  ["pyjamas", "pajamas", "pjs", "nightwear"],
  ["underwear", "pants", "boxers", "knickers", "bras", "socks"],
  ["dressing gown", "robe", "bathrobe"],
  ["handbag", "purse", "bag", "clutch"],
  ["suitcase", "luggage", "holdall", "travel bag"],
  ["backpack", "rucksack", "bag"],
  ["jewellery", "jewelry", "necklace", "earrings", "rings", "bracelet"],
  ["hanger", "coat hanger", "clothes hanger"],
  ["curtains", "drapes", "blinds"],
  ["rug", "mat", "carpet"],
  // bathroom
  ["toiletries", "wash bag", "washbag", "sponge bag"],
  ["make-up", "makeup", "cosmetics"],
  ["hairdryer", "hair dryer", "blow dryer"],
  ["straighteners", "hair straighteners", "flat iron", "ghds"],
  ["razor", "shaver", "trimmer", "clippers"],
  ["toothbrush", "electric toothbrush", "oral-b"],
  ["medicine", "medication", "meds", "tablets", "pills", "first aid", "plasters"],
  ["perfume", "aftershave", "cologne", "fragrance"],
  ["loo roll", "toilet roll", "toilet paper"],
  // furniture & decor
  ["sofa", "couch", "settee"],
  ["wardrobe", "closet"],
  ["chest of drawers", "drawers", "dresser"],
  ["bedside table", "nightstand", "bedside cabinet"],
  ["shelf", "shelves", "shelving", "bookcase"],
  ["picture", "frame", "photo frame", "picture frame", "artwork", "print", "painting"],
  ["photos", "photographs", "photo album", "pictures"],
  ["mirror", "looking glass"],
  ["vase", "flower vase"],
  ["plant", "houseplant", "plant pot", "planter"],
  ["candle", "tealight", "candle holder"],
  ["ornament", "decoration", "knick-knack", "trinket"],
  ["christmas decorations", "xmas decorations", "baubles", "tinsel", "christmas tree"],
  // tools, garage, garden
  ["toolbox", "tool kit", "toolkit", "tools"],
  ["screwdriver", "screwdrivers", "drill", "driver"],
  ["spanner", "wrench"],
  ["screws", "nails", "rawlplugs", "wall plugs", "fixings"],
  ["tape measure", "measuring tape"],
  ["ladder", "step ladder", "stepladder", "steps"],
  ["paint", "emulsion", "gloss"],
  ["paintbrush", "brushes", "roller"],
  ["lawnmower", "mower", "lawn mower"],
  ["strimmer", "trimmer", "weed whacker"],
  ["bbq", "barbecue", "barbeque", "grill"],
  ["garden furniture", "patio furniture", "garden chairs", "garden table"],
  ["hose", "hosepipe"],
  ["bike", "bicycle", "cycle"],
  ["tent", "camping"],
  ["sleeping bag", "camping bed", "air bed", "airbed"],
  // kids & pets
  ["pram", "pushchair", "buggy", "stroller"],
  ["nappies", "diapers"],
  ["dummy", "pacifier"],
  ["car seat", "booster seat"],
  ["highchair", "high chair"],
  ["dog", "puppy"],
  ["cat", "kitten"],
  ["lead", "leash"],
  ["pet bed", "dog bed", "cat bed", "basket"],
  ["cat litter", "litter", "litter tray"],
  // paperwork
  ["documents", "paperwork", "papers", "files", "folders"],
  ["passport", "birth certificate"],
  ["stationery", "pens", "pencils", "stapler"],
  ["keys", "spare keys"],
];

const norm = (s: string) => s.trim().toLowerCase();

/** "plates" → "plate", "boxes" → "box", "batteries" → "battery". Good enough for matching, not grammar. */
export function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// term (singular) → every other term in its groups.
const RELATED = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const terms = group.map(norm);
    for (const t of terms) {
      const key = singular(t);
      const set = map.get(key) ?? new Set<string>();
      for (const other of terms) if (other !== t) set.add(other);
      map.set(key, set);
    }
  }
  return map;
})();

/**
 * Other words to look for when someone searches `word`. A partial word
 * ("puzz") expands too, once it's long enough to be unambiguous.
 */
export function relatedTerms(word: string): string[] {
  const w = singular(norm(word));
  if (!w) return [];
  const out = new Set<string>();
  for (const [term, others] of RELATED) {
    if (term === w || (w.length >= 4 && term.startsWith(w))) {
      others.forEach((o) => out.add(o));
      out.add(term);
    }
  }
  out.delete(w);
  out.delete(norm(word));
  return Array.from(out);
}

/** Edit distance with adjacent swaps counting as one ("kettel" → "kettle" is 1). */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How a query word matched some text; higher is better, 0 is no match. */
export const MATCH = { none: 0, typo: 1, related: 2, exact: 3 } as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `term` as a whole word or phrase in `text`, allowing a plural ("jigsaw" in "2 jigsaws"). */
function hasWord(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escape(term)}(s|es)?($|[^a-z0-9])`).test(text);
}

/**
 * Best way `word` (lowercase) matches `text` (lowercase): as typed
 * (substring, so "ket" finds "kettle"), via a related word (whole words
 * only, so "case" never finds "bookcase"), or, when `allowTypos`, with a
 * small typo against a whole word in the text.
 */
export function matchWord(word: string, text: string, related: string[], allowTypos = false): number {
  if (text.includes(word)) return MATCH.exact;
  const sing = singular(word);
  if (sing !== word && text.includes(sing)) return MATCH.exact;
  if (related.some((r) => hasWord(text, r))) return MATCH.related;
  if (allowTypos && word.length >= 4) {
    const max = word.length >= 7 ? 2 : 1;
    for (const token of text.split(/[^a-z0-9À-ɏ]+/)) {
      if (token.length >= 3 && editDistance(word, token, max) <= max) return MATCH.typo;
    }
  }
  return MATCH.none;
}
