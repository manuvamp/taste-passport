import type { TasteCard } from "@/lib/types";
import { VIBES } from "@/data/vibes";

/**
 * Curated seed corpus: ~176 culturally real entities across 12 domains.
 * Images are resolved at runtime from Wikipedia (CC / public-domain thumbs)
 * via /api/img — no copyrighted binaries live in this repo.
 * Tags form the local semantic layer used by the mock taste graph; in live
 * mode the same entities are resolved against the real Qloo graph.
 *
 * ids are stable (kebab-case) so sessions/profiles survive dataset updates.
 */
export const SEED_CARDS: TasteCard[] = [
  // ---------- MUSIC ----------
  { id: "frank-ocean", title: "Frank Ocean", domain: "music", tags: ["r&b", "introspective", "atmospheric", "modern", "intimate", "experimental"] },
  { id: "radiohead", title: "Radiohead", domain: "music", tags: ["art-rock", "melancholic", "experimental", "electronic", "dark", "cerebral"] },
  { id: "bjork", title: "Björk", domain: "music", tags: ["art-pop", "experimental", "organic", "surreal", "kinetic", "avant-garde"] },
  { id: "miles-davis", title: "Miles Davis", domain: "music", tags: ["jazz", "improvisation", "noir", "cool", "night", "classic"] },
  { id: "daft-punk", title: "Daft Punk", domain: "music", tags: ["electronic", "house", "futuristic", "playful", "retro", "precision"] },
  { id: "kendrick-lamar", title: "Kendrick Lamar", domain: "music", tags: ["hip-hop", "storytelling", "political", "jazz-influenced", "raw"] },
  { id: "billie-eilish", title: "Billie Eilish", domain: "music", tags: ["whisper-pop", "dark", "minimal", "moody", "modern"] },
  { id: "rosalia", title: "Rosalía", domain: "music", tags: ["flamenco", "experimental-pop", "latin", "bold", "craft"] },
  { id: "fka-twigs", title: "FKA twigs", domain: "music", tags: ["avant-pop", "ethereal", "sensual", "experimental", "club"] },
  { id: "burna-boy", title: "Burna Boy", domain: "music", tags: ["afrobeat", "warm", "vibrant", "danceable", "african"] },
  { id: "tame-impala", title: "Tame Impala", domain: "music", tags: ["psychedelic", "dreamy", "retro", "hazy", "pop"] },
  { id: "nils-frahm", title: "Nils Frahm", domain: "music", tags: ["ambient", "neoclassical", "quiet", "minimal", "piano", "intimate"] },
  { id: "beach-house", title: "Beach House", domain: "music", tags: ["dream-pop", "atmospheric", "hazy", "nostalgic", "slow"] },
  { id: "aphex-twin", title: "Aphex Twin", domain: "music", tags: ["idm", "electronic", "surreal", "experimental", "machine"] },
  { id: "bad-bunny", title: "Bad Bunny", domain: "music", tags: ["reggaeton", "latin", "playful", "vibrant", "street"] },
  { id: "nina-simone", title: "Nina Simone", domain: "music", tags: ["jazz", "soul", "political", "raw", "classic"] },
  { id: "arctic-monkeys", title: "Arctic Monkeys", domain: "music", tags: ["indie-rock", "noir", "night", "attitude", "guitar"] },
  { id: "sade", title: "Sade", domain: "music", tags: ["smooth", "sophisticated", "quiet", "soul", "elegant"] },
  { id: "bicep", title: "Bicep", domain: "music", tags: ["electronic", "nostalgic", "club", "melodic", "cinematic"] },
  { id: "mesa-blanca-trio", title: "Botanica Del Jibaro", domain: "music", tags: ["experimental", "latin", "raw", "counterculture"] },

  // ---------- FILM ----------
  { id: "eeaao", title: "Everything Everywhere All at Once", domain: "film", tags: ["maximal", "playful", "sci-fi", "emotional", "kinetic", "surreal"] },
  { id: "moonlight", title: "Moonlight", domain: "film", wikiTitle: "Moonlight (2016 film)", tags: ["intimate", "quiet", "lyrical", "coming-of-age", "atmospheric"] },
  { id: "her", title: "Her", domain: "film", wikiTitle: "Her (film)", tags: ["sci-fi", "tender", "pastel", "minimal", "melancholic", "futuristic"] },
  { id: "blade-runner-2049", title: "Blade Runner 2049", domain: "film", tags: ["sci-fi", "neon", "cinematic", "moody", "epic", "brutal"] },
  { id: "parasite", title: "Parasite", domain: "film", wikiTitle: "Parasite (2019 film)", tags: ["satire", "thriller", "class", "korean", "sharp", "dark"] },
  { id: "in-the-mood-for-love", title: "In the Mood for Love", domain: "film", tags: ["romantic", "restrained", "textile", "nostalgic", "hong-kong", "atmospheric"] },
  { id: "drive", title: "Drive", domain: "film", wikiTitle: "Drive (2011 film)", tags: ["neon", "noir", "cool", "synth", "violent", "minimal"] },
  { id: "amelie", title: "Amélie", domain: "film", tags: ["whimsical", "warm", "french", "green", "playful", "romantic"] },
  { id: "spirited-away", title: "Spirited Away", domain: "film", tags: ["animation", "japanese", "surreal", "handmade", "fantasy", "warm"] },
  { id: "grand-budapest", title: "The Grand Budapest Hotel", domain: "film", tags: ["symmetrical", "pastel", "witty", "retro", "precise", "playful"] },
  { id: "dune-2021", title: "Dune", domain: "film", wikiTitle: "Dune (2021 film)", tags: ["epic", "desert", "monochrome", "sci-fi", "monumental", "brutal"] },
  { id: "call-me-by-your-name", title: "Call Me by Your Name", domain: "film", tags: ["romantic", "summer", "italian", "sensual", "literary", "warm"] },
  { id: "roma-2018", title: "Roma", domain: "film", wikiTitle: "Roma (2018 film)", tags: ["black-and-white", "intimate", "mexican", "slow", "domestic", "lyrical"] },
  { id: "portrait-lady-fire", title: "Portrait of a Lady on Fire", domain: "film", tags: ["romantic", "painterly", "restrained", "french", "fire", "gaze"] },
  { id: "la-haine", title: "La Haine", domain: "film", tags: ["black-and-white", "french", "gritty", "urban", "political"] },
  { id: "alien-1979", title: "Alien", domain: "film", wikiTitle: "Alien (film)", tags: ["horror", "sci-fi", "industrial", "claustrophobic", "dark"] },
  { id: "past-lives", title: "Past Lives", domain: "film", wikiTitle: "Past Lives (film)", tags: ["quiet", "tender", "korean", "diaspora", "minimal", "melancholic"] },
  { id: "mad-max-fury", title: "Mad Max: Fury Road", domain: "film", tags: ["kinetic", "desert", "maximal", "orange", "punk", "action"] },
  { id: "city-of-god", title: "City of God", domain: "film", tags: ["brazilian", "gritty", "kinetic", "vibrant", "urban"] },
  { id: "paterson-2016", title: "Paterson", domain: "film", wikiTitle: "Paterson (film)", tags: ["quiet", "poetic", "routine", "warm", "minimal", "observational"] },

  // ---------- TV ----------
  { id: "severance", title: "Severance", domain: "tv", wikiTitle: "Severance (TV series)", tags: ["retro-futuristic", "eerie", "minimal", "corporate", "mystery", "precise"] },
  { id: "the-bear", title: "The Bear", domain: "tv", wikiTitle: "The Bear (TV series)", tags: ["kitchen", "anxious", "raw", "chicago", "craft", "intense"] },
  { id: "fleabag", title: "Fleabag", domain: "tv", tags: ["witty", "british", "fourth-wall", "raw", "playful"] },
  { id: "dark-netflix", title: "Dark", domain: "tv", wikiTitle: "Dark (TV series)", tags: ["german", "time-travel", "moody", "cold", "mystery", "cerebral"] },
  { id: "squid-game", title: "Squid Game", domain: "tv", tags: ["korean", "satire", "playful", "violent", "pop"] },
  { id: "atlanta", title: "Atlanta", domain: "tv", wikiTitle: "Atlanta (TV series)", tags: ["surreal", "hip-hop", "deadpan", "american", "observational"] },
  { id: "succession", title: "Succession", domain: "tv", tags: ["corporate", "sharp", "dark-comedy", "wealth", "cold"] },
  { id: "euphoria", title: "Euphoria", domain: "tv", wikiTitle: "Euphoria (TV series)", tags: ["neon", "maximal", "sensual", "youth", "glitter", "dark"] },
  { id: "shogun-2024", title: "Shōgun", domain: "tv", wikiTitle: "Shōgun (2024 TV series)", tags: ["japanese", "historical", "epic", "restrained", "political"] },
  { id: "mr-robot", title: "Mr. Robot", domain: "tv", tags: ["hacker", "gritty", "paranoid", "techno", "dark"] },
  { id: "twin-peaks", title: "Twin Peaks", domain: "tv", tags: ["surreal", "dreamy", "noir", "eerie", "americana", "mystery"] },
  { id: "chernobyl", title: "Chernobyl", domain: "tv", tags: ["historical", "bleak", "brutal", "soviet", "tense"] },

  // ---------- FASHION ----------
  { id: "jil-sander", title: "Jil Sander", domain: "fashion", tags: ["minimal", "precise", "quiet-luxury", "white", "tailored", "restrained"] },
  { id: "comme-des-garcons", title: "Comme des Garçons", domain: "fashion", tags: ["avant-garde", "asymmetric", "conceptual", "black", "experimental"] },
  { id: "acne-studios", title: "Acne Studios", domain: "fashion", tags: ["scandinavian", "offbeat", "muted", "contemporary", "cool"] },
  { id: "lemaire", title: "Lemaire", domain: "fashion", tags: ["elegant", "flowing", "quiet-luxury", "french", "soft-tailoring"] },
  { id: "issey-miyake", title: "Issey Miyake", domain: "fashion", tags: ["pleats", "sculptural", "japanese", "technical", "kinetic"] },
  { id: "yohji-yamamoto", title: "Yohji Yamamoto", domain: "fashion", tags: ["black", "draped", "japanese", "poetic", "androgynous"] },
  { id: "gucci", title: "Gucci", domain: "fashion", tags: ["maximal", "ornate", "retro", "italian", "loud", "luxury"] },
  { id: "balenciaga", title: "Balenciaga", domain: "fashion", tags: ["brutal", "future", "ironic", "oversized", "tech"] },
  { id: "vivienne-westwood", title: "Vivienne Westwood", domain: "fashion", tags: ["punk", "rebellious", "british", "tartan", "corsetry"] },
  { id: "bathing-ape", title: "A Bathing Ape", domain: "fashion", tags: ["streetwear", "tokyo", "playful", "camo", "hype"] },
  { id: "carhartt-wip", title: "Carhartt WIP", domain: "fashion", tags: ["workwear", "utilitarian", "durable", "american", "street"] },
  { id: "margiela", title: "Maison Margiela", domain: "fashion", tags: ["deconstructed", "conceptual", "anonymous", "white", "artisan"] },
  { id: "rick-owens", title: "Rick Owens", domain: "fashion", tags: ["dark", "architectural", "brutal", "glamour", "concrete"] },
  { id: "loewe", title: "Loewe", domain: "fashion", tags: ["craft", "sculptural", "spanish", "leather", "artful"] },
  { id: "the-north-face", title: "The North Face", domain: "fashion", tags: ["outdoor", "technical", "functional", "urban", "gorp"] },
  { id: "prada", title: "Prada", domain: "fashion", tags: ["intellectual", "nylon", "italian", "paradoxical", "chic"] },

  // ---------- FOOD ----------
  { id: "kaiseki", title: "Kaiseki", domain: "food", tags: ["japanese-food", "seasonal", "precise", "quiet", "ritual", "craft"] },
  { id: "noma", title: "Noma", domain: "food", wikiTitle: "Noma (restaurant)", tags: ["nordic-food", "foraged", "experimental", "seasonal", "craft"] },
  { id: "sichuan-hotpot", title: "Sichuan Hotpot", domain: "food", tags: ["sichuan-food", "spicy", "communal", "fiery", "night"] },
  { id: "oaxacan", title: "Oaxacan Cuisine", domain: "food", tags: ["mexican-food", "mole", "corn", "smoky", "artisan", "earth"] },
  { id: "neapolitan-pizza", title: "Neapolitan Pizza", domain: "food", tags: ["italian-food", "char", "simple", "craft", "rustic"] },
  { id: "thai-street-food", title: "Thai Street Food", domain: "food", tags: ["thai-food", "street", "vibrant", "sweet-spicy", "night"] },
  { id: "georgian-khinkali", title: "Georgian Khinkali & Khachapuri", domain: "food", tags: ["georgian-food", "dumplings", "cheese", "hearty", "rustic"] },
  { id: "persian-food", title: "Persian Cuisine", domain: "food", tags: ["persian-food", "saffron", "herbed", "poetic", "ancient"] },
  { id: "ethiopian-injera", title: "Ethiopian Injera", domain: "food", tags: ["ethiopian-food", "communal", "sour", "spiced", "handmade"] },
  { id: "ceviche", title: "Peruvian Ceviche", domain: "food", tags: ["peruvian-food", "citrus", "raw", "coastal", "bright"] },
  { id: "korean-bbq", title: "Korean BBQ", domain: "food", tags: ["korean-food", "smoke", "communal", "night", "grill"] },
  { id: "viennese-coffee", title: "Viennese Coffee House", domain: "food", tags: ["austrian-food", "slow", "literary", "elegant", "cream"] },
  { id: "japanese-ramen", title: "Ramen", domain: "food", tags: ["japanese-food", "broth", "night", "humble", "steam"] },
  { id: "parisian-bistro", title: "Parisian Bistro", domain: "food", tags: ["french-food", "butter", "romantic", "timeless", "warm"] },
  { id: "dim-sum", title: "Dim Sum", domain: "food", tags: ["cantonese-food", "communal", "tea", "morning", "playful"] },
  { id: "turkish-breakfast", title: "Turkish Breakfast", domain: "food", tags: ["turkish-food", "spread", "slow", "warm", "social"] },
  { id: "natural-wine", title: "Natural Wine", domain: "food", wikiTitle: "Natural wine", tags: ["wine", "fermented", "funky", "counterculture", "artisan"] },
  { id: "fika", title: "Fika", domain: "food", wikiTitle: "Fika (Swedish coffee break)", tags: ["swedish-food", "coffee", "pause", "cozy", "cinnamon"] },
  { id: "izakaya", title: "Izakaya", domain: "food", tags: ["japanese-food", "night", "small-plates", "smoke", "lively"] },
  { id: "south-indian-dosa", title: "South Indian Dosa", domain: "food", tags: ["indian-food", "crisp", "fermented", "vegetarian", "spiced"] },

  // ---------- TRAVEL ----------
  { id: "kyoto", title: "Kyoto", domain: "travel", tags: ["japanese", "temple", "quiet", "seasonal", "craft", "zen"] },
  { id: "tokyo", title: "Tokyo", domain: "travel", tags: ["japanese", "neon", "urban", "night", "precision", "dense"] },
  { id: "lisbon", title: "Lisbon", domain: "travel", tags: ["coastal", "tiles", "hilly", "saudade", "warm", "faded"] },
  { id: "mexico-city", title: "Mexico City", domain: "travel", tags: ["mexican", "urban", "colorful", "food", "vibrant", "modernist"] },
  { id: "marrakech", title: "Marrakech", domain: "travel", tags: ["moroccan", "souk", "warm", "ornate", "desert", "sensory"] },
  { id: "reykjavik", title: "Reykjavík", domain: "travel", tags: ["nordic", "remote", "volcanic", "quiet", "austere"] },
  { id: "seoul", title: "Seoul", domain: "travel", tags: ["korean", "night", "tech", "hilly", "trendy", "layered"] },
  { id: "copenhagen", title: "Copenhagen", domain: "travel", tags: ["danish", "design", "bikes", "calm", "water", "minimal"] },
  { id: "havana", title: "Havana", domain: "travel", wikiTitle: "Havana", tags: ["cuban", "faded", "retro", "music", "tropical", "time-warp"] },
  { id: "cape-town", title: "Cape Town", domain: "travel", tags: ["african", "coastal", "mountain", "dramatic", "wine"] },
  { id: "taipei", title: "Taipei", domain: "travel", tags: ["taiwanese", "night-markets", "rainy", "neon", "tea"] },
  { id: "istanbul", title: "Istanbul", domain: "travel", tags: ["turkish", "strait", "layers", "mosques", "east-meets-west"] },
  { id: "amalfi", title: "Amalfi Coast", domain: "travel", tags: ["italian", "coastal", "sun", "lemon", "romantic"] },
  { id: "lofoten", title: "Lofoten", domain: "travel", tags: ["nordic", "fjord", "remote", "dramatic", "cold", "midnight-sun"] },
  { id: "bhutan", title: "Bhutan", domain: "travel", tags: ["himalayan", "monastery", "remote", "spiritual", "quiet"] },
  { id: "hanoi", title: "Hanoi", domain: "travel", tags: ["vietnamese", "street", "colonial", "humid", "bustling"] },

  // ---------- ARCHITECTURE / SPACES ----------
  { id: "church-of-light", title: "Church of the Light — Tadao Ando", domain: "architecture", tags: ["concrete", "japanese", "minimal", "light", "quiet", "sacred"] },
  { id: "farnsworth-house", title: "Farnsworth House", domain: "architecture", tags: ["glass", "minimal", "modernist", "transparent", "rural"] },
  { id: "fallingwater", title: "Fallingwater", domain: "architecture", tags: ["organic", "water", "forest", "cantilever", "warm"] },
  { id: "barcelona-pavilion", title: "Barcelona Pavilion", domain: "architecture", tags: ["modernist", "marble", "precise", "calm", "grid"] },
  { id: "sagrada-familia", title: "Sagrada Família", domain: "architecture", tags: ["ornate", "catalan", "light", "organic", "sacred", "maximal"] },
  { id: "centre-pompidou", title: "Centre Pompidou", domain: "architecture", tags: ["inside-out", "industrial", "colorful", "radical", "urban"] },
  { id: "salk-institute", title: "Salk Institute", domain: "architecture", tags: ["concrete", "brutalist", "ocean", "silent", "monumental"] },
  { id: "nakagin-capsule", title: "Nakagin Capsule Tower", domain: "architecture", tags: ["metabolism", "japanese", "capsule", "retro-future", "modular"] },
  { id: "guggenheim-bilbao", title: "Guggenheim Bilbao", domain: "architecture", tags: ["titanium", "curved", "sculptural", "bold", "ship"] },
  { id: "villa-savoye", title: "Villa Savoye", domain: "architecture", tags: ["modernist", "white", "pilotis", "rational", "le-corbusier"] },
  { id: "barbican", title: "Barbican Estate", domain: "architecture", tags: ["brutalist", "concrete", "urban", "gardens", "textured"] },
  { id: "ryoan-ji", title: "Ryōan-ji Rock Garden", domain: "architecture", tags: ["zen", "japanese", "minimal", "stone", "silence"] },
  { id: "moroccan-riad", title: "Moroccan Riad", domain: "architecture", tags: ["courtyard", "tile", "ornate", "warm", "private", "moroccan"] },
  { id: "sydney-opera", title: "Sydney Opera House", domain: "architecture", tags: ["sails", "coastal", "sculptural", "iconic", "white"] },

  // ---------- BOOKS ----------
  { id: "kafka-on-the-shore", title: "Kafka on the Shore", domain: "book", tags: ["japanese", "surreal", "dreamy", "quest", "magical"] },
  { id: "norwegian-wood", title: "Norwegian Wood", domain: "book", tags: ["japanese", "melancholic", "youth", "quiet", "romantic"] },
  { id: "master-margarita", title: "The Master and Margarita", domain: "book", tags: ["soviet", "satanic", "satire", "surreal", "classic"] },
  { id: "invisible-cities", title: "Invisible Cities", domain: "book", tags: ["italian", "labyrinth", "poetic", "architectural", "minimal"] },
  { id: "left-hand-of-darkness", title: "The Left Hand of Darkness", domain: "book", tags: ["sci-fi", "cold", "anthropological", "quiet", "gender"] },
  { id: "infinite-jest", title: "Infinite Jest", domain: "book", tags: ["maximal", "footnotes", "tennis", "addiction", "american"] },
  { id: "remains-of-the-day", title: "The Remains of the Day", domain: "book", tags: ["british", "restrained", "regret", "elegant", "quiet"] },
  { id: "piranesi", title: "Piranesi", domain: "book", wikiTitle: "Piranesi (novel)", tags: ["labyrinth", "statues", "quiet", "mystery", "tidal"] },
  { id: "wind-up-bird", title: "The Wind-Up Bird Chronicle", domain: "book", tags: ["japanese", "deep-well", "mystery", "surreal", "urban"] },
  { id: "beloved", title: "Beloved", domain: "book", wikiTitle: "Beloved (novel)", tags: ["american", "haunting", "historical", "raw", "lyrical"] },
  { id: "one-hundred-years", title: "One Hundred Years of Solitude", domain: "book", tags: ["colombian", "generational", "magical", "tropical", "epic"] },
  { id: "the-bell-jar", title: "The Bell Jar", domain: "book", tags: ["american", "confessional", "sharp", "melancholic", "fig"] },

  // ---------- GAMES ----------
  { id: "journey-game", title: "Journey", domain: "game", wikiTitle: "Journey (2012 video game)", tags: ["minimal", "desert", "wordless", "emotional", "sand", "elegiac"] },
  { id: "hollow-knight", title: "Hollow Knight", domain: "game", tags: ["hand-drawn", "melancholic", "insect", "labyrinth", "difficult", "gothic"] },
  { id: "celeste", title: "Celeste", domain: "game", wikiTitle: "Celeste (video game)", tags: ["pixel", "climb", "anxious", "tender", "precise", "mountain"] },
  { id: "elden-ring", title: "Elden Ring", domain: "game", tags: ["dark-fantasy", "open", "brutal", "mythic", "golden", "ruins"] },
  { id: "disco-elysium", title: "Disco Elysium", domain: "game", tags: ["detective", "literary", "political", "hungover", "dialogue", "gritty"] },
  { id: "botw", title: "Zelda: Breath of the Wild", domain: "game", tags: ["open-air", "curiosity", "green", "quiet", "climb", "physics"] },
  { id: "hades", title: "Hades", domain: "game", wikiTitle: "Hades (video game)", tags: ["greek", "kinetic", "hot", "repetition", "stylish", "myth"] },
  { id: "outer-wilds", title: "Outer Wilds", domain: "game", tags: ["space", "curiosity", "loop", "banjo", "cosy-sci-fi", "wonder"] },
  { id: "stardew-valley", title: "Stardew Valley", domain: "game", tags: ["pixel", "farm", "cozy", "seasons", "gentle", "community"] },
  { id: "ghost-of-tsushima", title: "Ghost of Tsushima", domain: "game", tags: ["japanese", "wind", "samurai", "painterly", "autumn"] },

  // ---------- BRANDS ----------
  { id: "a24", title: "A24", domain: "brand", tags: ["indie-film", "taste", "curation", "modern", "arthouse", "distinct"] },
  { id: "muji", title: "Muji", domain: "brand", tags: ["no-brand", "japanese", "minimal", "everyday", "calm", "honest"] },
  { id: "uniqlo-u", title: "Uniqlo U", domain: "brand", tags: ["basics", "japanese", "affordable-minimal", "clean", "everyday"] },
  { id: "aesop", title: "Aesop", domain: "brand", tags: ["apothecary", "sensory", "brown", "quiet-luxury", "store-design"] },
  { id: "bang-olufsen", title: "Bang & Olufsen", domain: "brand", tags: ["danish", "audio", "aluminium", "craft", "elegant"] },
  { id: "patagonia", title: "Patagonia", domain: "brand", tags: ["outdoor", "ethical", "earthy", "activist", "durable"] },
  { id: "teenage-engineering", title: "Teenage Engineering", domain: "brand", tags: ["industrial-design", "playful", "grey", "synth", "toy-like"] },
  { id: "lego", title: "LEGO", domain: "brand", tags: ["play", "system", "colorful", "generational", "build"] },
  { id: "sonos", title: "Sonos", domain: "brand", tags: ["audio", "minimal", "home", "mesh", "calm-tech"] },
  { id: "herman-miller", title: "Herman Miller", domain: "brand", tags: ["office", "iconic", "ergonomic", "modernist", "design"] },

  // ---------- ART ----------
  { id: "teamlab", title: "teamLab", domain: "art", tags: ["immersive", "digital", "flowers", "kinetic", "japanese", "dreamy"] },
  { id: "kusama", title: "Yayoi Kusama", domain: "art", wikiTitle: "Yayoi Kusama", tags: ["dots", "infinity", "japanese", "obsessive", "playful", "pumpkin"] },
  { id: "banksy", title: "Banksy", domain: "art", wikiTitle: "Banksy", tags: ["street", "political", "ironic", "stencil", "guerrilla"] },
  { id: "rothko-chapel", title: "Rothko Chapel", domain: "art", tags: ["meditative", "dark", "color-field", "quiet", "sacred"] },
  { id: "basquiat", title: "Jean-Michel Basquiat", domain: "art", tags: ["neo-expressionist", "raw", "crown", "graffiti", "energetic"] },
  { id: "kahlo", title: "Frida Kahlo", domain: "art", tags: ["mexican", "self-portrait", "symbolic", "pain", "flora", "vibrant"] },
  { id: "hiroshige", title: "Hiroshige Prints", domain: "art", tags: ["ukiyo-e", "japanese", "rain", "travel", "flat-color", "seasonal"] },
  { id: "van-gogh-museum", title: "Van Gogh Museum", domain: "art", tags: ["dutch", "impasto", "swirl", "yellow", "emotional"] },
  { id: "moma", title: "MoMA", domain: "art", tags: ["modern", "white-cube", "canonical", "new-york", "minimal"] },
  { id: "gesamtkunstwerk-bauhaus", title: "Bauhaus", domain: "art", tags: ["school", "primary-colors", "functional", "geometric", "rational"] },
  { id: "murakami-takashi", title: "Takashi Murakami", domain: "art", tags: ["superflat", "japanese", "flowers", "pop", "kawaii"] },
  { id: "olafur-eliasson", title: "Olafur Eliasson", domain: "art", tags: ["weather", "light", "immersive", "danish", "perceptual"] },

  // ---------- LIFESTYLE ----------
  { id: "zazen", title: "Zazen Meditation", domain: "lifestyle", tags: ["zen", "silence", "posture", "japanese", "daily-practice"] },
  { id: "vinyl-collecting", title: "Vinyl Collecting", domain: "lifestyle", tags: ["analog", "ritual", "warm", "tangibility", "music"] },
  { id: "specialty-coffee", title: "Specialty Coffee", domain: "lifestyle", wikiTitle: "Specialty coffee", tags: ["brewing", "precision", "origin", "ritual", "craft"] },
  { id: "bouldering", title: "Bouldering", domain: "lifestyle", tags: ["movement", "problem-solving", "chalk", "community", "physical"] },
  { id: "sauna-culture", title: "Sauna Culture", domain: "lifestyle", tags: ["nordic", "heat", "ritual", "quiet", "wood"] },
  { id: "shinrin-yoku", title: "Shinrin-yoku (Forest Bathing)", domain: "lifestyle", tags: ["forest", "slow", "sensory", "japanese", "calm"] },
  { id: "onsen", title: "Onsen", domain: "lifestyle", tags: ["japanese", "hot-spring", "steam", "ritual", "mountain"] },
  { id: "film-photography", title: "Film Photography", domain: "lifestyle", tags: ["analog", "grain", "patience", "nostalgic", "frames"] },
  { id: "skateboarding", title: "Skateboarding", domain: "lifestyle", wikiTitle: "Skateboarding", tags: ["street", "urban", "persistence", "youth", "concrete"] },
  { id: "rave-culture", title: "Rave Culture", domain: "lifestyle", wikiTitle: "Rave", tags: ["electronic", "night", "communal", "strobe", "freedom"] },
  { id: "cycling-culture", title: "Cycling Culture", domain: "lifestyle", tags: ["urban", "speed", "self-powered", "craft", "endurance"] },
  { id: "sunday-baking", title: "Slow Sunday Baking", domain: "lifestyle", tags: ["domestic", "warm", "seasonal", "cozy", "handmade"] },
];

/** Broad, deliberately diverse cold-start batch (round 1) — 26 cards, 11 domains. */
export const COLD_START_IDS = [
  // music ×3
  "frank-ocean", "radiohead", "bad-bunny",
  // film ×3
  "grand-budapest", "blade-runner-2049", "moonlight",
  // tv ×2
  "severance", "the-bear",
  // fashion ×3
  "jil-sander", "comme-des-garcons", "the-north-face",
  // food ×3
  "kaiseki", "sichuan-hotpot", "neapolitan-pizza",
  // travel ×3
  "kyoto", "lisbon", "reykjavik",
  // architecture ×3
  "church-of-light", "barbican", "fallingwater",
  // book ×1
  "kafka-on-the-shore",
  // game ×1
  "journey-game",
  // brand ×2
  "uniqlo-u", "a24",
  // art ×1
  "kusama",
  // lifestyle ×1
  "vinyl-collecting",
];

/** Preset demo personas (deterministic sessions for judges). */
export const DEMO_PERSONAS: Record<
  string,
  { name: string; blurb: string; likes: string[]; dislikes: string[] }
> = {
  maya: {
    name: "Maya",
    blurb: "Quiet-intensity aesthete: A24, Frank Ocean, Jil Sander, Kyoto.",
    likes: ["a24", "frank-ocean", "jil-sander", "kyoto", "church-of-light", "nils-frahm", "past-lives", "muji", "kafka-on-the-shore", "ryoan-ji", "kaiseki", "lemaire"],
    dislikes: ["gucci", "sichuan-hotpot", "mad-max-fury", "euphoria"],
  },
  alex: {
    name: "Alex",
    blurb: "Maximal night-energy: Gucci, Bad Bunny, blade-runner neon, hotpot.",
    likes: ["gucci", "bad-bunny", "blade-runner-2049", "sichuan-hotpot", "tokyo", "severance", "euphoria", "rave-culture", "bathing-ape", "neapolitan-pizza", "seoul", "hades"],
    dislikes: ["nils-frahm", "ryoan-ji", "farnsworth-house", "muji"],
  },
};

let _byId: Map<string, TasteCard> | null = null;
export function cardsById(): Map<string, TasteCard> {
  // vibes resolve for interactions/profiles but are not part of SEED_CARDS (depth feed)
  return (_byId ??= new Map([...SEED_CARDS, ...VIBES].map((c) => [c.id, c])));
}
