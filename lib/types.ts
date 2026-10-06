// Shared domain types for Taste Passport.

export type Domain =
  | "music"
  | "film"
  | "tv"
  | "fashion"
  | "food"
  | "travel"
  | "architecture"
  | "book"
  | "game"
  | "brand"
  | "art"
  | "lifestyle";

export const DOMAINS: Domain[] = [
  "music",
  "film",
  "tv",
  "fashion",
  "food",
  "travel",
  "architecture",
  "book",
  "game",
  "brand",
  "art",
  "lifestyle",
];

/** Map our product domains to Qloo entity type URNs (valid on /v2/insights). */
export const DOMAIN_TO_QLOO_TYPE: Partial<Record<Domain, string>> = {
  music: "urn:entity:artist",
  film: "urn:entity:movie",
  tv: "urn:entity:tv_show",
  fashion: "urn:entity:brand",
  food: "urn:entity:place",
  travel: "urn:entity:destination",
  brand: "urn:entity:brand",
  book: "urn:entity:book",
  game: "urn:entity:video_game",
  architecture: "urn:entity:place",
  art: "urn:entity:place",
};

/**
 * A visual card in the discovery feed. Cards are backed by a real cultural
 * entity so every interaction becomes a structured Qloo signal.
 */
export type TasteCard = {
  id: string;
  title: string;
  domain: Domain;
  /** Freeform cultural/vibe tags — the local semantic layer over the taste graph. */
  tags: string[];
  /** Wikipedia article title used to resolve a legally-usable image at runtime. */
  wikiTitle?: string;
  /** Static image URL override (used rarely; Wikipedia resolution is the default). */
  imageUrl?: string;
  /** Optional pre-known Qloo entity id (resolved at runtime in live mode otherwise). */
  qlooEntityId?: string;
  /** Human blurb shown on demand; keep it short. */
  blurb?: string;
};

export type Interaction = "like" | "dislike" | "skip";

export type TasteSignal = {
  cardId: string;
  entityId: string; // Qloo entity id when known, else card id
  entityType: string;
  domain: Domain;
  interaction: Interaction;
  weight: number;
  timestamp: string;
  round: number;
  /** Feedback loop origin, e.g. "feed" or "recommendation:<id>" */
  source?: string;
};

export type TasteState = {
  sessionId: string;
  signals: TasteSignal[];
  shownCardIds: string[];
  domainWeights: Record<string, number>;
  tagVector: Record<string, number>; // positive/negative aesthetic vector
  explorationLevel: number; // 0..1, decays as confidence grows
  confidence: number; // 0..1
  profileVersion: number;
  lastUpdated: string;
};

export type ExplorationPool = "exploit" | "adjacent" | "novel";

export type ProfileCluster = {
  domain: Domain;
  label: string;
  entities: string[]; // card titles
  tags: string[];
};

export type UnexpectedConnection = {
  title: string;
  domain: Domain;
  cardId?: string;
  reason: string;
  /** Which of the user's entities Qloo/graph linked it to. */
  bridges: string[];
  qlooBacked: boolean;
};

export type TasteProfile = {
  sessionId: string;
  profileVersion: number;
  interactionCount: number;
  confidence: number;
  archetype: { name: string; description: string };
  coreEntities: { title: string; domain: Domain; cardId: string }[];
  positiveSignals: { title: string; domain: Domain; cardId: string; weight: number }[];
  negativeSignals: { title: string; domain: Domain; cardId?: string; weight: number }[];
  inferredTags: { tag: string; weight: number }[];
  domainPreferences: Record<string, number>;
  clusters: ProfileCluster[];
  unexpectedConnections: UnexpectedConnection[];
  tasteSummary: string;
  narrative: string;
  lastUpdated: string;
  mode: "mock" | "live";
};

/** Result rows from the Qloo adapter (normalized). */
export type QlooEntity = {
  entityId: string;
  name: string;
  type: string;
  imageUrl?: string;
  location?: { lat: number; lon: number };
  tags?: { id: string; name: string }[];
  affinity?: number;
  popularity?: number;
  /** Per-input-entity contribution scores when explainability was requested. */
  explainability?: Record<string, number>;
};

export type RecommendationResult = {
  entities: QlooEntity[];
  source: "qloo" | "mock";
  durationMs: number;
};
