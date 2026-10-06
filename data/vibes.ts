import type { Domain, TasteCard } from "@/lib/types";

/**
 * Phase-1 "vibe" tiles: ~120 instantly readable, people-free things (dishes,
 * places, rooms, textures, moods). They feed the same taste engine as seed
 * cards (tags overlap the seed vocabulary), but never appear in the depth feed.
 *
 * Tuple: [id, label, emoji, hue, domain, tags[], imageQuery?]
 * imageQuery is resolved to a photo by scripts/resolve-vibe-images.mjs and
 * stored in data/vibe-images.json; the emoji+gradient tile is the instant base.
 */
type Row = [string, string, string, number, Domain, string[], string?];

const ROWS: Row[] = [
  // ---- cuisines & dishes ----
  ["v-ramen", "Ramen", "🍜", 28, "food", ["japanese-food", "broth", "night", "humble", "steam"], "Tonkotsu ramen"],
  ["v-sushi", "Sushi", "🍣", 8, "food", ["japanese-food", "precise", "quiet", "craft"], "Nigiri sushi"],
  ["v-pizza", "Wood-fired pizza", "🍕", 18, "food", ["italian-food", "char", "simple", "craft", "rustic"], "Pizza Margherita"],
  ["v-tacos", "Street tacos", "🌮", 40, "food", ["mexican-food", "street", "vibrant", "night"], "Tacos al pastor"],
  ["v-hotpot", "Hotpot", "🍲", 5, "food", ["sichuan-food", "spicy", "communal", "fiery", "night"], "Chinese hot pot"],
  ["v-dimsum", "Dim sum", "🥟", 45, "food", ["cantonese-food", "communal", "tea", "morning", "playful"], "Dim sum"],
  ["v-curry", "Curry & spice", "🍛", 35, "food", ["indian-food", "spiced", "warm", "vibrant"], "Indian curry dish"],
  ["v-padthai", "Thai street food", "🍤", 24, "food", ["thai-food", "street", "vibrant", "sweet-spicy", "night"], "Pad thai"],
  ["v-bbq", "Korean BBQ", "🥩", 10, "food", ["korean-food", "smoke", "communal", "night", "grill"], "Korean barbecue"],
  ["v-ceviche", "Ceviche", "🐟", 175, "food", ["peruvian-food", "citrus", "raw", "coastal", "bright"], "Ceviche"],
  ["v-mezze", "Mezze table", "🫒", 95, "food", ["persian-food", "herbed", "communal", "warm", "social"], "Meze"],
  ["v-injera", "Ethiopian platter", "🫓", 30, "food", ["ethiopian-food", "communal", "spiced", "handmade"], "Injera"],
  ["v-bistro", "Parisian bistro", "🥖", 38, "food", ["french-food", "butter", "romantic", "timeless", "warm"], "Steak frites"],
  ["v-pasta", "Handmade pasta", "🍝", 42, "food", ["italian-food", "handmade", "craft", "warm", "rustic"], "Tagliatelle"],
  ["v-burger", "Smash burger", "🍔", 20, "food", ["american", "street", "playful", "loud"], "Hamburger"],
  ["v-breakfast", "Slow breakfast spread", "🍳", 48, "food", ["turkish-food", "spread", "slow", "warm", "social"], "Turkish breakfast"],
  ["v-pastry", "Fresh pastries", "🥐", 36, "food", ["french-food", "butter", "morning", "handmade", "cozy"], "Croissant"],
  ["v-cake", "Slow Sunday baking", "🍰", 330, "lifestyle", ["domestic", "warm", "seasonal", "cozy", "handmade"], "Layer cake"],
  ["v-coffee", "Specialty coffee", "☕", 25, "lifestyle", ["brewing", "precision", "origin", "ritual", "craft"], "Pour-over coffee"],
  ["v-tea", "Tea ceremony", "🍵", 110, "lifestyle", ["japanese", "ritual", "quiet", "seasonal", "zen"], "Matcha"],
  ["v-wine", "Natural wine", "🍷", 345, "food", ["wine", "fermented", "funky", "counterculture", "artisan"], "Red wine glass"],
  ["v-cocktail", "Cocktail bar", "🍸", 280, "food", ["night", "sophisticated", "craft", "smooth"], "Cocktail"],
  ["v-icecream", "Gelato", "🍨", 330, "food", ["italian-food", "playful", "summer", "sweet-spicy"], "Gelato"],
  ["v-seafood", "Seafood on ice", "🦪", 195, "food", ["coastal", "raw", "bright", "elegant"], "Oyster"],
  ["v-farmers", "Farmers market", "🥬", 100, "food", ["seasonal", "earth", "artisan", "foraged"], "Farmers' market"],
  ["v-bbqfire", "Cooking over fire", "🔥", 15, "food", ["smoke", "grill", "rustic", "communal"], "Barbecue grill"],

  // ---- places ----
  ["v-kyoto", "Temple lanes", "⛩️", 355, "travel", ["japanese", "temple", "quiet", "seasonal", "zen"], "Fushimi Inari-taisha"],
  ["v-neon-city", "Neon city night", "🌃", 265, "travel", ["neon", "urban", "night", "dense", "precision"], "Shibuya Crossing"],
  ["v-tiles", "Tiled hillside town", "🏘️", 30, "travel", ["coastal", "tiles", "hilly", "faded", "warm"], "Lisbon Alfama"],
  ["v-amalfi", "Cliffside coast", "🍋", 50, "travel", ["italian", "coastal", "sun", "lemon", "romantic"], "Positano"],
  ["v-fjord", "Fjords & midnight sun", "🏔️", 200, "travel", ["nordic", "fjord", "remote", "dramatic", "cold"], "Lofoten"],
  ["v-desert", "Desert dunes", "🏜️", 32, "travel", ["desert", "monochrome", "remote", "austere", "epic"], "Sahara"],
  ["v-souk", "Spice souk", "🧿", 22, "travel", ["moroccan", "souk", "warm", "ornate", "sensory"], "Marrakesh souk"],
  ["v-canal", "Canals & bikes", "🚲", 205, "travel", ["danish", "design", "bikes", "calm", "water"], "Copenhagen Nyhavn"],
  ["v-tropical", "Tropical beach", "🏝️", 175, "travel", ["tropical", "sun", "coastal", "warm"], "Maldives"],
  ["v-alps", "Alpine cabin", "🏡", 215, "travel", ["cozy", "wood", "quiet", "mountain", "remote"], "Swiss Alps"],
  ["v-rainy-street", "Rainy night market", "🌧️", 245, "travel", ["night-markets", "rainy", "neon", "tea"], "Shilin Night Market"],
  ["v-colonial", "Faded colonial street", "🚕", 12, "travel", ["cuban", "faded", "retro", "music", "tropical"], "Havana"],
  ["v-bazaar", "Old city rooftops", "🕌", 38, "travel", ["turkish", "layers", "east-meets-west", "ornate"], "Istanbul"],
  ["v-himalaya", "Monastery in the mountains", "🛕", 18, "travel", ["himalayan", "monastery", "remote", "spiritual", "quiet"], "Paro Taktsang"],
  ["v-volcano", "Black sand & volcanoes", "🌋", 5, "travel", ["volcanic", "remote", "austere", "nordic", "dramatic"], "Iceland"],
  ["v-forest", "Misty forest", "🌲", 140, "lifestyle", ["forest", "slow", "sensory", "calm"], "Shinrin-yoku"],
  ["v-lake", "Still lake at dawn", "🛶", 205, "travel", ["calm", "quiet", "water", "minimal"], "Lake Como"],
  ["v-roadtrip", "Open road", "🛣️", 25, "travel", ["american", "retro", "freedom", "epic"], "Route 66"],
  ["v-skyline", "Glass skyline", "🏙️", 225, "travel", ["urban", "tech", "dense", "layered"], "Hong Kong skyline"],
  ["v-onsen", "Hot spring steam", "♨️", 20, "lifestyle", ["japanese", "hot-spring", "steam", "ritual", "mountain"], "Onsen"],
  ["v-sauna", "Wood sauna", "🧖", 28, "lifestyle", ["nordic", "heat", "ritual", "quiet", "wood"], "Sauna"],
  ["v-camping", "Campfire & tents", "⛺", 25, "lifestyle", ["outdoor", "functional", "community", "earthy"], "Camping"],
  ["v-surf", "Surf break", "🏄", 190, "lifestyle", ["movement", "coastal", "physical", "freedom"], "Surfing"],

  // ---- spaces & architecture ----
  ["v-concrete", "Raw concrete & light", "🏛️", 210, "architecture", ["concrete", "minimal", "light", "quiet", "brutalist"], "Church of the Light"],
  ["v-glasshouse", "Glass house in the woods", "🪟", 150, "architecture", ["glass", "minimal", "modernist", "transparent", "rural"], "Farnsworth House"],
  ["v-ornate", "Ornate cathedral", "⛪", 45, "architecture", ["ornate", "light", "sacred", "maximal"], "Sagrada Família"],
  ["v-curve", "Sculptural curves", "🌀", 250, "architecture", ["curved", "sculptural", "bold", "titanium"], "Guggenheim Museum Bilbao"],
  ["v-zen-garden", "Zen garden", "🪨", 130, "architecture", ["zen", "japanese", "minimal", "stone", "silence"], "Ryōan-ji"],
  ["v-riad", "Tiled courtyard", "🕋", 195, "architecture", ["courtyard", "tile", "ornate", "warm", "moroccan"], "Riad (house)"],
  ["v-library", "Old library", "📚", 35, "architecture", ["literary", "quiet", "warm", "timeless"], "Trinity College Library"],
  ["v-loft", "Industrial loft", "🏭", 220, "architecture", ["industrial", "urban", "textured", "raw"], "Loft"],
  ["v-cozy-room", "Cozy reading nook", "🛋️", 28, "lifestyle", ["cozy", "warm", "domestic", "quiet"], "Reading nook"],
  ["v-greenhouse", "Plant-filled greenhouse", "🪴", 125, "lifestyle", ["green", "organic", "warm", "seasonal"], "Greenhouse"],
  ["v-whitecube", "White-walled gallery", "🖼️", 215, "art", ["modern", "white-cube", "minimal", "canonical"], "Museum of Modern Art"],
  ["v-brutal-estate", "Brutalist estate", "🏢", 215, "architecture", ["brutalist", "concrete", "urban", "textured"], "Barbican Estate"],
  ["v-retrofuture", "Retro-futurist tower", "🗼", 275, "architecture", ["retro-future", "japanese", "modular", "metabolism"], "Nakagin Capsule Tower"],
  ["v-treehouse", "Organic cabin by water", "🌿", 120, "architecture", ["organic", "water", "forest", "warm"], "Fallingwater"],
  ["v-spiral", "Spiral staircase", "🐚", 20, "architecture", ["geometric", "precise", "sculptural", "classic"], "Spiral staircase"],
  ["v-bridge", "Grand steel bridge", "🌉", 12, "architecture", ["iconic", "industrial", "epic", "urban"], "Golden Gate Bridge"],

  // ---- art, color, texture ----
  ["v-pop-art", "Bold pop colour", "🎨", 320, "art", ["pop", "playful", "maximal", "colorful", "loud"], "Pop art"],
  ["v-dots", "Polka-dot infinity", "🔴", 355, "art", ["dots", "infinity", "obsessive", "playful"], "Infinity Mirror Room"],
  ["v-ukiyo", "Woodblock waves", "🌊", 205, "art", ["ukiyo-e", "japanese", "flat-color", "seasonal"], "The Great Wave off Kanagawa"],
  ["v-impasto", "Swirling brushwork", "🌻", 50, "art", ["impasto", "swirl", "emotional", "yellow"], "The Starry Night"],
  ["v-graffiti", "Street art wall", "🎭", 300, "art", ["street", "graffiti", "raw", "guerrilla", "energetic"], "Graffiti"],
  ["v-bauhaus", "Primary-colour geometry", "🔺", 5, "art", ["primary-colors", "geometric", "functional", "rational"], "Bauhaus"],
  ["v-colorfield", "Deep colour field", "🟪", 285, "art", ["meditative", "dark", "color-field", "quiet"], "Color field painting"],
  ["v-sculpture", "Marble sculpture", "🗿", 215, "art", ["classic", "sculptural", "timeless", "quiet"], "Marble sculpture"],
  ["v-ceramics", "Handmade ceramics", "🏺", 25, "art", ["handmade", "craft", "artisan", "earthy"], "Pottery"],
  ["v-textile", "Woven textiles", "🧶", 340, "art", ["textile", "handmade", "craft", "warm"], "Weaving"],
  ["v-neon-sign", "Neon signs", "💡", 310, "art", ["neon", "night", "retro", "urban"], "Neon sign"],
  ["v-film-grain", "Grainy film photo", "🎞️", 35, "lifestyle", ["analog", "grain", "nostalgic", "frames"], "Film photography"],
  ["v-vinyl", "Vinyl & turntable", "💿", 270, "lifestyle", ["analog", "ritual", "warm", "music"], "Phonograph record"],
  ["v-typewriter", "Typewriter & paper", "⌨️", 40, "lifestyle", ["analog", "literary", "nostalgic", "craft"], "Typewriter"],
  ["v-monochrome", "Black & white minimal", "◼️", 0, "art", ["minimal", "monochrome", "quiet", "precise"], "Black-and-white photography"],
  ["v-pastel", "Pastel symmetry", "🩷", 335, "art", ["pastel", "symmetrical", "playful", "retro"], "Pastel colors"],
  ["v-gold", "Gold & ornament", "✨", 48, "art", ["ornate", "maximal", "luxury", "golden"], "Baroque"],
  ["v-glitch", "Digital glitch", "👾", 150, "art", ["digital", "futuristic", "experimental", "machine"], "Glitch art"],

  // ---- fashion & objects (no people) ----
  ["v-tailored", "Quiet tailoring", "🧥", 30, "fashion", ["minimal", "tailored", "quiet-luxury", "restrained"], "Trench coat"],
  ["v-sneakers", "Sneaker wall", "👟", 350, "fashion", ["streetwear", "hype", "playful", "street"], "Sneakers"],
  ["v-denim", "Worn denim & workwear", "👖", 215, "fashion", ["workwear", "utilitarian", "durable", "american"], "Selvedge denim"],
  ["v-black-drape", "All-black draping", "🖤", 270, "fashion", ["black", "draped", "avant-garde", "dark"], "Black dress fabric"],
  ["v-outdoor-gear", "Technical outdoor gear", "🎒", 140, "fashion", ["outdoor", "technical", "functional", "gorp"], "Backpack"],
  ["v-leather", "Leather goods", "👜", 25, "fashion", ["craft", "leather", "artisan", "classic"], "Leather handbag"],
  ["v-punk", "Tartan & safety pins", "🧷", 355, "fashion", ["punk", "rebellious", "british", "tartan"], "Punk fashion"],
  ["v-jewelry", "Chunky jewellery", "💍", 45, "fashion", ["maximal", "ornate", "sculptural", "bold"], "Jewellery"],
  ["v-audio", "Hi-fi audio gear", "🔊", 215, "brand", ["audio", "craft", "elegant", "minimal"], "Hi-fi"],
  ["v-synth", "Synths & knobs", "🎛️", 20, "brand", ["synth", "playful", "industrial-design", "electronic"], "Synthesizer"],
  ["v-design-chair", "Design-classic chair", "🪑", 30, "brand", ["iconic", "modernist", "design", "ergonomic"], "Eames Lounge Chair"],
  ["v-camera", "Vintage camera", "📷", 215, "lifestyle", ["analog", "nostalgic", "craft", "frames"], "Rangefinder camera"],
  ["v-lego", "Colourful bricks", "🧱", 5, "brand", ["play", "system", "colorful", "build"], "Lego"],
  ["v-keyboard", "Mechanical keyboard", "🖥️", 215, "brand", ["tech", "precision", "craft", "playful"], "Computer keyboard"],

  // ---- scenes, moods & lifestyle ----
  ["v-night-rave", "Strobe-lit dance floor", "🪩", 290, "lifestyle", ["electronic", "night", "communal", "strobe", "freedom"], "Nightclub"],
  ["v-jazz-bar", "Smoky jazz club", "🎷", 35, "music", ["jazz", "noir", "night", "cool", "improvisation"], "Jazz club"],
  ["v-festival", "Summer festival crowd", "🎪", 15, "music", ["communal", "vibrant", "danceable", "summer"], "Music festival"],
  ["v-piano", "Quiet piano room", "🎹", 215, "music", ["piano", "quiet", "minimal", "intimate", "neoclassical"], "Grand piano"],
  ["v-guitars", "Loud guitar amps", "🎸", 5, "music", ["guitar", "raw", "attitude", "indie-rock"], "Electric guitar"],
  ["v-orchestra", "Concert hall", "🎻", 38, "music", ["classic", "elegant", "cerebral", "timeless"], "Concert hall"],
  ["v-skate", "Skate park", "🛹", 215, "lifestyle", ["street", "urban", "youth", "concrete"], "Skateboarding"],
  ["v-climb", "Climbing wall", "🧗", 12, "lifestyle", ["movement", "problem-solving", "physical", "community"], "Rock climbing"],
  ["v-yoga", "Morning stretch", "🧘", 280, "lifestyle", ["zen", "silence", "daily-practice", "calm"], "Yoga"],
  ["v-cycling", "Early morning ride", "🚴", 150, "lifestyle", ["urban", "self-powered", "endurance", "speed"], "Road bicycle"],
  ["v-garden", "Wild cottage garden", "🌸", 335, "lifestyle", ["seasonal", "organic", "warm", "handmade"], "Cottage garden"],
  ["v-picnic", "Sunday picnic", "🧺", 60, "lifestyle", ["social", "summer", "warm", "slow"], "Picnic"],
  ["v-fireplace", "Fireplace & blankets", "🕯️", 25, "lifestyle", ["cozy", "warm", "domestic", "slow"], "Fireplace"],
  ["v-rain-window", "Rain on the window", "☔", 215, "lifestyle", ["rainy", "quiet", "melancholic", "slow"], "Rain"],
  ["v-sunset", "Golden-hour glow", "🌅", 30, "lifestyle", ["warm", "nostalgic", "romantic", "summer"], "Golden hour"],
  ["v-snow", "Snowy silence", "❄️", 200, "lifestyle", ["quiet", "cold", "minimal", "nordic"], "Snow"],
  ["v-city-rain", "Moody night drive", "🚘", 260, "film", ["neon", "noir", "cool", "synth", "minimal"], "Neon noir"],
  ["v-cinema", "Old movie theatre", "🎬", 5, "film", ["cinematic", "nostalgic", "retro", "romantic"], "Movie theater"],
  ["v-scifi", "Sci-fi landscape", "🪐", 270, "film", ["sci-fi", "epic", "futuristic", "cinematic"], "Science fiction film"],
  ["v-anime", "Hand-painted animation", "🍃", 140, "film", ["animation", "handmade", "japanese", "fantasy", "warm"], "Studio Ghibli"],
  ["v-pixel", "Pixel-art world", "🎮", 150, "game", ["pixel", "cozy", "gentle", "community"], "Pixel art"],
  ["v-fantasy", "Dark fantasy ruins", "🏰", 40, "game", ["dark-fantasy", "ruins", "mythic", "gothic"], "Castle ruins"],
  ["v-space", "Starfield & nebula", "🌌", 265, "game", ["space", "wonder", "curiosity", "epic"], "Nebula"],
  ["v-bookstore", "Cluttered bookshop", "📖", 28, "book", ["literary", "warm", "quiet", "nostalgic"], "Bookstore"],
  ["v-poetry", "Handwritten notebook", "📝", 40, "book", ["poetic", "intimate", "quiet", "melancholic"], "Notebook"],
  ["v-comic", "Graphic novel panels", "💥", 355, "book", ["playful", "kinetic", "maximal", "pop"], "Comics"],
];

export type Vibe = TasteCard & { emoji: string; hue: number; imageQuery?: string };

export const VIBES: Vibe[] = ROWS.map(([id, title, emoji, hue, domain, tags, imageQuery]) => ({
  id,
  title,
  emoji,
  hue,
  domain,
  tags,
  imageQuery,
}));

export const VIBE_IDS = new Set(VIBES.map((v) => v.id));

export function isVibe(id: string): boolean {
  return VIBE_IDS.has(id);
}
