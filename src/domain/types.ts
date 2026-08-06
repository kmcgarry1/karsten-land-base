// ─── Core colour types ───────────────────────────────────────────────────────

export type MtgColour = "W" | "U" | "B" | "R" | "G";
export type MtgColourOrColourless = MtgColour | "C";

export const ALL_COLOURS: MtgColour[] = ["W", "U", "B", "R", "G"];

// ─── Scryfall raw card data ───────────────────────────────────────────────────

export interface ScryfallCardFace {
  name: string;
  type_line: string;
  mana_cost?: string;
  oracle_text?: string;
  colors?: string[];
  produced_mana?: string[];
  image_uris?: {
    art_crop?: string;
    large?: string;
    normal?: string;
  };
}

export interface ScryfallCard {
  id: string;
  name: string;
  type_line: string;
  mana_cost?: string;
  oracle_text?: string;
  color_identity: string[];
  cmc: number;
  card_faces?: ScryfallCardFace[];
  image_uris?: {
    art_crop?: string;
    large?: string;
    normal?: string;
  };
  produced_mana?: string[];
  layout?: string;
}

// ─── Domain card record ───────────────────────────────────────────────────────

export interface CardRecord {
  scryfallId?: string;
  name: string;
  typeLine: string;
  manaCost?: string;
  oracleText?: string;
  colourIdentity: MtgColour[];
  cmc: number;
  imageUris?: {
    artCrop?: string;
    large?: string;
    normal?: string;
  };
  faces?: Array<{
    name: string;
    typeLine: string;
    manaCost?: string;
    oracleText?: string;
    colours?: MtgColour[];
    producedMana?: MtgColourOrColourless[];
    imageUris?: {
      artCrop?: string;
      large?: string;
      normal?: string;
    };
  }>;
  producedMana?: MtgColourOrColourless[];
  quantity: number;
  isCommander?: boolean;
}

// ─── Mana source classification ───────────────────────────────────────────────

export type SourceType =
  | "basic"
  | "untappedLand"
  | "tapland"
  | "conditionalUntap" // check lands, slow lands, fast lands
  | "fetchland"
  | "pathway"
  | "rainbow" // Command Tower, City of Brass, Mana Confluence
  | "bounceLand"
  | "mdfc"
  | "twoManaRock" // Arcane Signet, Signets, Talismans
  | "manaRock" // Thran Dynamo, Gilded Lotus, etc. (colourless)
  | "manaDork"
  | "turnTwoRamp" // Nature's Lore, Three Visits, Farseek
  | "turnThreeRamp" // Cultivate, Kodama's Reach, Myriad Landscape
  | "opponentDependent" // Exotic Orchard, Fellwar Stone
  | "other";

/** How a land's untap condition behaves */
export type UntapConditionType =
  | "none" // always untapped
  | "alwaysTapped" // always ETB tapped
  | "twoOrFewerLands" // fast lands
  | "controlBasicOrType" // check lands
  | "controlTwoBasiscs" // slow lands
  | "payTwoLife" // shocklands
  | "bounce"; // returns a land to hand

export interface ManaSourceProfile {
  cardName: string;
  sourceType: SourceType;
  producedColours: MtgColour[]; // colours this source can produce
  typedLandSubtypes: string[]; // Forest, Island, etc. (for fetch targeting)
  isTappedOnEntry: boolean;
  untapCondition: UntapConditionType;
  untapConditionDescription: string;
  activationCostGeneric: number; // e.g. 1 for signets (need {1} to activate)
  isOpponentDependent: boolean;
  requiresSummoningTurn: boolean; // true for dorks (can't use turn played)
  isFetchland: boolean;
  fetchTargetSubtypes: string[]; // land subtypes this fetch can find
  isMDFC: boolean;
  mdFCLandSideEntersTapped: boolean;
  isColourlessOnly: boolean;
  isBasicLand: boolean;
  isRainbow: boolean; // makes all legal deck colours (restricted to identity)
  availableFromTurn: number; // 1 = untapped, 2 = ETB-tapped, 3 = rocks/dorks
  baseWeight: number; // Karsten heuristic base weight (0–1)
}

// ─── Commander info ───────────────────────────────────────────────────────────

export interface CommanderInfo {
  names: string[];
  colourIdentity: MtgColour[];
  count: number; // 1 or 2 (partners)
  librarySize: number; // 99 (one commander) or 98 (two commanders)
}

// ─── Spell targets ────────────────────────────────────────────────────────────

export type PriorityTier = "must" | "nice" | "late";

export interface SpellTarget {
  id: string;
  cardName: string;
  targetTurn: number;
  requiredPips: Partial<Record<MtgColour, number>>; // e.g. { U: 2, B: 1 }
  totalManaValue: number;
  probabilityThreshold: number; // default 0.90
  priorityTier: PriorityTier;
  isAutoDetected: boolean;
}

// ─── Analysis results ─────────────────────────────────────────────────────────

export type AnalysisStatus = "pass" | "fail" | "pending";
export type DeficitLevel = "none" | "low" | "moderate" | "high";

export interface ColourSourceCount {
  colour: MtgColour;
  landSources: number; // from lands only
  rockSources: number; // from rocks/ramp/dorks
  totalEffective: number; // weighted total
  neededSources: number; // Karsten threshold at 90%
  deficit: number; // neededSources - totalEffective (positive = deficit)
  deficitLevel: DeficitLevel;
}

export interface SpellAnalysisResult {
  target: SpellTarget;
  sourceCounts: Partial<Record<MtgColour, ColourSourceCount>>;
  heuristicProbability: number; // Karsten heuristic estimate (hypergeom)
  exactProbability: number | null; // Monte Carlo simulation
  status: AnalysisStatus;
  colourBottleneck: MtgColour | null;
  notes: string[];
}

export interface SourceContribution {
  cardName: string;
  sourceType: SourceType;
  colours: MtgColour[];
  weightByColour: Partial<Record<MtgColour, number>>;
  quantity: number;
  entersTapped: boolean;
  note: string;
}

export interface SourceExplanation {
  target: SpellTarget;
  requiredPips: Partial<Record<MtgColour, number>>;
  sourceCounts: Partial<Record<MtgColour, ColourSourceCount>>;
  contributions: {
    lands: SourceContribution[];
    rocksRamp: SourceContribution[];
    fetches: SourceContribution[];
    conditional: SourceContribution[];
    opponentDependent: SourceContribution[];
  };
  notes: string[];
}

export interface CardAnalysisRow {
  id: string;
  card: CardRecord;
  target: SpellTarget | null;
  karstenResult: SpellAnalysisResult | null;
  exactProbability: number | null;
  sourceBreakdown: SourceExplanation | null;
  image: string;
  isSelectedTarget: boolean;
}

export interface AnalysisReport {
  mode: "karsten" | "exact";
  commanderInfo: CommanderInfo;
  deckName?: string;
  landCount: number;
  taplandCount: number;
  totalCards: number;
  spellResults: SpellAnalysisResult[];
  overallColourSummary: ColourSourceCount[];
  recommendations: Recommendation[];
  warnings: string[];
  assumptions: string[];
  timestamp: number;
}

export interface ShareFallbackData {
  deckName: string;
  rawText: string;
  settings: AnalysisSettings;
  targets: SpellTarget[];
}

export interface SharedAnalysisPayload {
  schemaVersion: 1;
  createdAt: number;
  expiresAt: number;
  report: AnalysisReport;
  fallback: ShareFallbackData;
}

export interface Recommendation {
  id: string;
  type: "add-land" | "swap-for-better-dual" | "lower-requirement" | "add-rock" | "info";
  priority: "high" | "medium" | "low";
  description: string;
  affectedColours: MtgColour[];
  estimatedSourceDelta: Partial<Record<MtgColour, number>>;
  tradeOffNote?: string;
}

// ─── Deck parsing ─────────────────────────────────────────────────────────────

export interface DeckEntry {
  quantity: number;
  name: string;
  originalName?: string;
  lookupName?: string;
  isCommander?: boolean;
}

export interface ParsedDecklist {
  entries: DeckEntry[];
  commanderEntries: DeckEntry[];
  deckEntries: DeckEntry[];
  rawText: string;
  errors: string[];
  duplicateNames: string[];
  sections: string[];
}

export interface DeckSnapshot {
  id: string;
  name: string;
  rawText: string;
  commanderNames: string[];
  settings: AnalysisSettings;
  createdAt: number;
  updatedAt: number;
}

// ─── Analysis settings ────────────────────────────────────────────────────────

export interface AnalysisSettings {
  mode: "karsten" | "exact";
  knownPodColours: MtgColour[];
  targetThreshold: number; // default 0.90
  simulationIterations: number; // default 50000
  countMDFCsAsLands: boolean;
  countTaplandsTurnTwo: boolean; // Karsten optimistic rule (turn 2+ taplands count)
  countFellwarAsHalf: boolean;
  countOrchardAsThreeQuarter: boolean;
  usePartnerRule: boolean; // library = 98 if two commanders
  simulationRunning: boolean;
  simulationProgress: number; // 0–1
}

// ─── Simulation worker messages ───────────────────────────────────────────────

export interface SimulationInput {
  deck: CardRecord[];
  commander: CommanderInfo;
  targets: SpellTarget[];
  settings: AnalysisSettings;
  sourceProfiles: Record<string, ManaSourceProfile>;
  iterations: number;
}

export interface SimulationOutput {
  probabilities: Record<string, number>; // target.id → probability
  iterations: number;
  durationMs: number;
}

export type WorkerMessage =
  | { type: "start"; payload: SimulationInput }
  | { type: "progress"; payload: { progress: number } }
  | { type: "result"; payload: SimulationOutput }
  | { type: "error"; payload: { message: string } };
