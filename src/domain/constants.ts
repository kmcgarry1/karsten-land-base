import type { MtgColour, AnalysisSettings } from "./types";

// ─── Colour display configuration ────────────────────────────────────────────

export interface ColourConfig {
  symbol: string;
  name: string;
  cssClass: string;
  hex: string;
  manaSymbol: string; // e.g. "{W}"
}

export const COLOUR_CONFIG: Record<MtgColour, ColourConfig> = {
  W: { symbol: "W", name: "White", cssClass: "colour-w", hex: "#f9faf4", manaSymbol: "{W}" },
  U: { symbol: "U", name: "Blue", cssClass: "colour-u", hex: "#0e68ab", manaSymbol: "{U}" },
  B: { symbol: "B", name: "Black", cssClass: "colour-b", hex: "#3d3230", manaSymbol: "{B}" },
  R: { symbol: "R", name: "Red", cssClass: "colour-r", hex: "#d3202a", manaSymbol: "{R}" },
  G: { symbol: "G", name: "Green", cssClass: "colour-g", hex: "#00733e", manaSymbol: "{G}" },
};

// ─── Karsten 2022 Commander thresholds ───────────────────────────────────────
// Derived from Karsten's 2022 code: 99-card library, 41 lands, free first
// mulligan look (keep on 3–5 lands), London mulligan, T1 draw in Commander.
// These are the minimum effective sources needed for ~90% casting probability.

/** Returns threshold lookup key: "Xpip-TY[-untapped]" */
export function karstenThresholdKey(pips: number, turn: number): string {
  const t = Math.min(turn, 6);
  if (turn === 1) return `${pips}pip-T1-untapped`;
  return `${pips}pip-T${t}`;
}

export const KARSTEN_COMMANDER_THRESHOLDS: Record<string, number> = {
  // Single pip
  "1pip-T1-untapped": 19,
  "1pip-T2": 18,
  "1pip-T3": 16,
  "1pip-T4": 14,
  "1pip-T5": 13,
  "1pip-T6": 11,

  // Double pip
  "2pip-T1-untapped": 29, // rare but possible (Birds of Paradise on T1 needs GG)
  "2pip-T2": 29,
  "2pip-T3": 27,
  "2pip-T4": 24,
  "2pip-T5": 21,
  "2pip-T6": 18,

  // Triple pip
  "3pip-T3": 35,
  "3pip-T4": 30,
  "3pip-T5": 26,
  "3pip-T6": 22,

  // Quadruple pip
  "4pip-T4": 38,
  "4pip-T5": 33,
  "4pip-T6": 28,

  // Quintuple pip (WUBRG and similar)
  "5pip-T5": 39,
  "5pip-T6": 35,
};

// ─── Library and land-count assumptions ──────────────────────────────────────

export const COMMANDER_LIBRARY_SIZE = 99;
export const TWO_COMMANDER_LIBRARY_SIZE = 98;
export const COMMANDER_LAND_COUNT_ASSUMPTION = 41; // Karsten's fixed assumption

// ─── Source weight constants (Karsten heuristics) ────────────────────────────

/** Two-mana rocks (Arcane Signet, Signets, Talismans) weight for MV 3+ spells */
export const ROCK_WEIGHT = 0.75;

/** Exotic Orchard weight (unknown pod) */
export const EXOTIC_ORCHARD_WEIGHT = 0.75;

/** Fellwar Stone weight (unknown pod) */
export const FELLWAR_STONE_WEIGHT = 0.5;

/** Fast lands and conditional-untap lands: counted from T2 onward (Karsten default) */
export const CONDITIONAL_UNTAP_AVAILABLE_FROM = 2;

// ─── Typed land subtypes and basic land mappings ─────────────────────────────

export const BASIC_LAND_SUBTYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"] as const;

export const BASIC_SUBTYPE_TO_COLOUR: Record<string, MtgColour> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
};

export const COLOUR_TO_BASIC_SUBTYPE: Record<MtgColour, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

// ─── Known card lists for classifier heuristics ──────────────────────────────

/** Two-mana ramp spells available by turn 3, search typed lands */
export const TURN_TWO_RAMP_SPELLS = new Set([
  "Nature's Lore",
  "Three Visits",
  "Farseek",
  "Skyshroud Claim",
  "Cultivate", // actually T3 ramp but often grouped
  "Rampant Growth",
]);

/** Turn-three ramp spells (count only for MV 4+ spells) */
export const TURN_THREE_RAMP_SPELLS = new Set([
  "Cultivate",
  "Kodama's Reach",
  "Myriad Landscape",
  "Explosive Vegetation",
  "Migration Path",
  "Circuitous Route",
]);

/** Cards with opponent-dependent colour production */
export const OPPONENT_DEPENDENT_CARDS = new Set([
  "Exotic Orchard",
  "Fellwar Stone",
  "Path of Ancestry", // produces colour of commander
  "Sol Ring", // colourless only — separate handling
]);

/** Known rainbow lands: produce all colours in commander's identity */
export const RAINBOW_LANDS = new Set([
  "Command Tower",
  "Mana Confluence",
  "City of Brass",
  "Reflecting Pool",
  "Pillar of the Paruns",
  "Urborg, Tomb of Yawgmoth", // makes everything a Swamp
  "Cavern of Souls", // for creature types, simplified as rainbow
  "Unclaimed Territory",
  "Commander's Sphere",
  "Chromatic Lantern",
  "Chromatic Orrery",
]);

/** Known fetchlands and what land subtypes they can find */
export const FETCHLAND_TARGETS: Record<string, string[]> = {
  "Polluted Delta": ["Island", "Swamp"],
  "Flooded Strand": ["Plains", "Island"],
  "Bloodstained Mire": ["Swamp", "Mountain"],
  "Wooded Foothills": ["Mountain", "Forest"],
  "Windswept Heath": ["Plains", "Forest"],
  "Misty Rainforest": ["Island", "Forest"],
  "Verdant Catacombs": ["Swamp", "Forest"],
  "Scalding Tarn": ["Island", "Mountain"],
  "Arid Mesa": ["Plains", "Mountain"],
  "Marsh Flats": ["Plains", "Swamp"],
  "Fabled Passage": ["Plains", "Island", "Swamp", "Mountain", "Forest"],
  "Prismatic Vista": ["Plains", "Island", "Swamp", "Mountain", "Forest"],
  "Evolving Wilds": ["Plains", "Island", "Swamp", "Mountain", "Forest"],
  "Terramorphic Expanse": ["Plains", "Island", "Swamp", "Mountain", "Forest"],
  "Naya Panorama": ["Mountain", "Forest", "Plains"],
  "Jund Panorama": ["Swamp", "Mountain", "Forest"],
  "Grixis Panorama": ["Island", "Swamp", "Mountain"],
  "Esper Panorama": ["Plains", "Island", "Swamp"],
  "Bant Panorama": ["Plains", "Island", "Forest"],
};

// ─── Default settings ─────────────────────────────────────────────────────────

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  mode: "karsten",
  knownPodColours: [],
  targetThreshold: 0.9,
  simulationIterations: 50000,
  countMDFCsAsLands: true,
  countTaplandsTurnTwo: true,
  countFellwarAsHalf: true,
  countOrchardAsThreeQuarter: true,
  usePartnerRule: false,
  simulationRunning: false,
  simulationProgress: 0,
};

// ─── Mulligan policy (Karsten 2022) ──────────────────────────────────────────

/** Keep thresholds: [minLands, maxLands] per hand size in regular London mulligan */
export const LONDON_MULLIGAN_KEEP: Record<number, [number, number]> = {
  7: [2, 5],
  6: [2, 4],
  5: [2, 4],
  4: [0, 7], // always keep
};

/** Commander free-look keep range (first seven-card look): keep on 3–5 lands */
export const COMMANDER_FREE_LOOK_KEEP: [number, number] = [3, 5];
