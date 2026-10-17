/**
 * Common things people pack, grouped by the room they usually live in.
 *
 * Used for name autocomplete, for "tap to add" suggestions on an empty name
 * field (picked by the box's destination room), and as the label set the
 * on-device photo matcher chooses from.
 */
export const VOCABULARY: Record<string, string[]> = {
  kitchen: [
    "Kettle", "Toaster", "Microwave", "Air fryer", "Slow cooker", "Blender", "Food processor",
    "Stand mixer", "Hand mixer", "Coffee machine", "Cafetière", "Coffee grinder", "Juicer",
    "Rice cooker", "Sandwich toaster", "Saucepans", "Frying pan", "Wok", "Casserole dish",
    "Baking trays", "Cake tins", "Roasting tin", "Mixing bowls", "Measuring jug", "Kitchen scales",
    "Chopping boards", "Knife block", "Kitchen knives", "Utensils", "Wooden spoons", "Spatula",
    "Ladle", "Whisk", "Tongs", "Colander", "Sieve", "Grater", "Peeler", "Tin opener",
    "Bottle opener", "Corkscrew", "Rolling pin", "Plates", "Bowls", "Side plates", "Mugs",
    "Cups", "Glasses", "Wine glasses", "Pint glasses", "Cutlery", "Serving dishes", "Teapot",
    "Tupperware", "Food containers", "Lunch boxes", "Water bottles", "Flasks", "Tea towels",
    "Oven gloves", "Aprons", "Placemats", "Coasters", "Spice rack", "Spices", "Herbs",
    "Tins", "Pasta", "Rice", "Cereal", "Baking supplies", "Tea", "Coffee", "Condiments",
    "Oils and vinegars", "Cookbooks", "Bread bin", "Fruit bowl", "Dish rack", "Washing up bowl",
    "Bin", "Recycling bin", "Ice cube trays", "Kitchen roll holder", "Storage jars",
  ],
  bathroom: [
    "Towels", "Hand towels", "Bath mat", "Shower curtain", "Toiletries", "Shampoo",
    "Conditioner", "Shower gel", "Soap", "Toothbrushes", "Toothpaste", "Electric toothbrush",
    "Razor", "Shaver", "Hairdryer", "Hair straighteners", "Curling tongs", "Hairbrush",
    "Make-up", "Make-up bag", "Skincare", "Perfume", "Aftershave", "Deodorant",
    "First aid kit", "Medicines", "Plasters", "Vitamins", "Toilet roll", "Toilet brush",
    "Bathroom bin", "Bathroom scales", "Mirror", "Wash bag", "Cotton wool", "Nail kit",
    "Cleaning products", "Bath toys",
  ],
  bedroom: [
    "Bedding", "Duvet", "Duvet cover", "Pillows", "Pillowcases", "Sheets", "Fitted sheet",
    "Mattress protector", "Blanket", "Throw", "Cushions", "Clothes", "Shirts", "T-shirts",
    "Jumpers", "Hoodies", "Trousers", "Jeans", "Shorts", "Dresses", "Skirts", "Suits",
    "Jackets", "Coats", "Underwear", "Socks", "Pyjamas", "Gym clothes", "Swimwear", "Shoes",
    "Trainers", "Boots", "Slippers", "Sandals", "Belts", "Ties", "Scarves", "Hats", "Gloves",
    "Handbags", "Jewellery", "Jewellery box", "Watches", "Sunglasses", "Coat hangers",
    "Bedside lamp", "Alarm clock", "Books", "Photo frames", "Mirror", "Laundry basket",
    "Suitcase", "Backpack", "Holdall", "Hot water bottle", "Electric blanket", "Fan",
    "Dressing gown", "Keepsakes",
  ],
  living: [
    "TV", "TV remote", "TV stand", "Soundbar", "Speakers", "Games console", "Controllers",
    "Video games", "DVDs", "Blu-rays", "Vinyl records", "Record player", "CDs", "Router",
    "Streaming stick", "HDMI cables", "Extension leads", "Books", "Board games", "Puzzles",
    "Playing cards", "Cushions", "Throws", "Rug", "Lamp", "Floor lamp", "Candles",
    "Candle holders", "Vases", "Ornaments", "Picture frames", "Photo albums", "Artwork",
    "Clock", "Plants", "Plant pots", "Magazines", "Side table", "Footstool", "Curtains",
    "Blinds", "Decorations",
  ],
  dining: [
    "Tablecloth", "Napkins", "Placemats", "Coasters", "Candlesticks", "Serving platters",
    "Gravy boat", "Wine glasses", "Champagne flutes", "Decanter", "Fine china", "Cutlery set",
    "Salt and pepper", "Table runner", "Dining chairs cushions",
  ],
  office: [
    "Laptop", "Laptop charger", "Monitor", "Keyboard", "Mouse", "Webcam", "Headphones",
    "Headset", "Microphone", "Desk lamp", "Printer", "Printer paper", "Ink cartridges",
    "Scanner", "Shredder", "Desktop computer", "Docking station", "USB hub", "Hard drive",
    "USB sticks", "Cables", "Phone chargers", "Power bank", "Tablet", "E-reader", "Camera",
    "Camera lenses", "Tripod", "Notebooks", "Stationery", "Pens", "Stapler", "Hole punch",
    "Sellotape", "Files", "Folders", "Paperwork", "Important documents", "Passports",
    "Calculator", "Desk organiser", "Books", "Whiteboard", "Desk chair cushion",
  ],
  garage: [
    "Toolbox", "Tools", "Drill", "Drill bits", "Screwdrivers", "Hammer", "Spanners",
    "Wrench set", "Saw", "Tape measure", "Spirit level", "Screws", "Nails", "Rawlplugs",
    "Paint", "Paint brushes", "Rollers", "Dust sheets", "Ladder", "Step ladder",
    "Extension cable reel", "Torch", "Batteries", "Light bulbs", "Car cleaning kit",
    "Jump leads", "Bike", "Bike pump", "Bike helmet", "Bike lock", "Camping gear", "Tent",
    "Sleeping bags", "Camping chairs", "Cool box", "Sports equipment", "Golf clubs",
    "Fishing gear", "Christmas decorations", "Christmas tree", "Halloween decorations",
    "Storage boxes", "Spare parts", "Cleaning supplies", "Vacuum cleaner", "Mop and bucket",
    "Iron", "Ironing board", "Clothes airer", "Washing powder", "Fabric softener",
  ],
  garden: [
    "Lawnmower", "Strimmer", "Hedge trimmer", "Leaf blower", "Garden tools", "Spade", "Fork",
    "Rake", "Trowel", "Secateurs", "Watering can", "Hose", "Hose reel", "Plant pots",
    "Compost", "Seeds", "Bird feeder", "Garden furniture", "Cushions", "Parasol", "BBQ",
    "BBQ tools", "Charcoal", "Fire pit", "Outdoor lights", "Pressure washer", "Wheelbarrow",
    "Gardening gloves", "Kids' outdoor toys",
  ],
  kids: [
    "Toys", "Soft toys", "Lego", "Dolls", "Action figures", "Toy cars", "Train set",
    "Building blocks", "Art supplies", "Colouring books", "Crayons", "Kids' books",
    "School uniform", "School bag", "Baby clothes", "Nappies", "Baby wipes", "Bottles",
    "Steriliser", "Baby monitor", "Changing mat", "Pram", "Car seat", "High chair",
    "Night light", "Bath toys", "Puzzles", "Games",
  ],
  pets: [
    "Pet bed", "Pet bowls", "Pet food", "Lead", "Collar", "Harness", "Pet carrier",
    "Cat litter", "Litter tray", "Scratching post", "Pet toys", "Pet grooming kit",
    "Fish tank", "Pet medication",
  ],
  hallway: [
    "Coats", "Shoes", "Umbrellas", "Keys", "Key hooks", "Shoe rack", "Doormat", "Mirror",
    "Post", "Dog lead", "Bags for life", "Hoover attachments",
  ],
  loft: [
    "Christmas decorations", "Suitcases", "Old photos", "Keepsakes", "Memorabilia",
    "Seasonal clothes", "Spare bedding", "Old toys", "Baby things", "Records and files",
    "Spare curtains", "Storage boxes", "Sentimental items", "Old electronics",
  ],
};

/** Which vocabulary groups fit a room, based on keywords in its name. */
const ROOM_KEYWORDS: [RegExp, string[]][] = [
  [/kitchen|utility|pantry|larder/i, ["kitchen"]],
  [/bath|shower|en.?suite|wc|toilet|cloak/i, ["bathroom"]],
  [/nursery|kid|child|play/i, ["kids", "bedroom"]],
  [/bed|guest/i, ["bedroom"]],
  [/living|lounge|sitting|family|tv|den|snug/i, ["living"]],
  [/dining/i, ["dining", "kitchen"]],
  [/office|study|work/i, ["office"]],
  [/garage|shed|workshop|outhouse|cellar|basement/i, ["garage", "garden"]],
  [/garden|patio|yard/i, ["garden"]],
  [/hall|porch|landing|entrance/i, ["hallway"]],
  [/loft|attic|storage/i, ["loft"]],
  [/laundry/i, ["garage"]],
  [/pet|dog|cat/i, ["pets"]],
];

/** Every vocabulary word once, in a stable order. */
export const ALL_WORDS: string[] = Array.from(new Set(Object.values(VOCABULARY).flat()));

/** Vocabulary for a destination room, best guess from its name. Empty for unknown rooms. */
export function wordsForRoom(room: string | null | undefined): string[] {
  if (!room) return [];
  const groups = new Set<string>();
  for (const [re, gs] of ROOM_KEYWORDS) {
    if (re.test(room)) gs.forEach((g) => groups.add(g));
  }
  return Array.from(new Set(Array.from(groups).flatMap((g) => VOCABULARY[g] ?? [])));
}
