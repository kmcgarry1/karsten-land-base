import type {
  AnalysisStatus,
  AnalysisReport,
  ColourSourceCount,
  DeficitLevel,
  MtgColour,
  PriorityTier,
  Recommendation,
  SharedAnalysisPayload,
  SpellAnalysisResult,
  SpellTarget,
} from "../domain/types";
import { validateAnalysisSettings, isPlainRecord, isSafeCardName } from "./validation";
import { SECURITY_LIMITS } from "./limits";

const VALID_COLOURS = new Set<MtgColour>(["W", "U", "B", "R", "G"]);
const VALID_STATUS = new Set<AnalysisStatus>(["pass", "fail", "pending"]);
const VALID_PRIORITY = new Set<PriorityTier>(["must", "nice", "late"]);
const VALID_RECOMMENDATION_TYPES = new Set<Recommendation["type"]>([
  "add-land",
  "swap-for-better-dual",
  "lower-requirement",
  "add-rock",
  "info",
]);
const VALID_RECOMMENDATION_PRIORITY = new Set<Recommendation["priority"]>([
  "high",
  "medium",
  "low",
]);
const VALID_DEFICIT_LEVELS = new Set<DeficitLevel>(["none", "low", "moderate", "high"]);

export function validateSharedAnalysisPayload(value: unknown): SharedAnalysisPayload | null {
  if (!isPlainRecord(value)) return null;

  if (value.schemaVersion !== 1) return null;
  const createdAt = safePositiveNumber(value.createdAt);
  const expiresAt = safePositiveNumber(value.expiresAt);
  if (createdAt === null || expiresAt === null || expiresAt <= createdAt) return null;

  const now = Date.now();
  if (expiresAt < now) return null;
  if (createdAt > now + 60_000) return null;
  if (now - createdAt > SECURITY_LIMITS.sharePayloadMaxAgeMs) return null;

  const report = validateAnalysisReport(value.report);
  if (!report) return null;

  const fallback = validateFallback(value.fallback);
  if (!fallback) return null;

  return {
    schemaVersion: 1,
    createdAt,
    expiresAt,
    report,
    fallback,
  };
}

function validateFallback(value: unknown): SharedAnalysisPayload["fallback"] | null {
  if (!isPlainRecord(value)) return null;
  if (
    typeof value.deckName !== "string" ||
    value.deckName.length > SECURITY_LIMITS.savedDeckNameCharacters
  ) {
    return null;
  }
  if (
    typeof value.rawText !== "string" ||
    value.rawText.length > SECURITY_LIMITS.deckTextCharacters
  ) {
    return null;
  }
  if (!Array.isArray(value.targets) || value.targets.length > SECURITY_LIMITS.simulationTargets) {
    return null;
  }
  const targets: SpellTarget[] = [];
  for (const targetValue of value.targets) {
    const target = validateSpellTarget(targetValue);
    if (!target) return null;
    targets.push(target);
  }

  return {
    deckName: value.deckName.trim(),
    rawText: value.rawText,
    settings: validateAnalysisSettings(value.settings),
    targets,
  };
}

function validateAnalysisReport(value: unknown): AnalysisReport | null {
  if (!isPlainRecord(value)) return null;
  const mode = value.mode;
  if (mode !== "karsten" && mode !== "exact") return null;

  const commanderInfo = validateCommanderInfo(value.commanderInfo);
  if (!commanderInfo) return null;

  const landCount = safeInteger(value.landCount);
  const taplandCount = safeInteger(value.taplandCount);
  const totalCards = safeInteger(value.totalCards);
  const timestamp = safePositiveNumber(value.timestamp);
  if (landCount === null || taplandCount === null || totalCards === null || timestamp === null) {
    return null;
  }

  if (
    !Array.isArray(value.spellResults) ||
    value.spellResults.length > SECURITY_LIMITS.simulationTargets
  ) {
    return null;
  }
  const spellResults: SpellAnalysisResult[] = [];
  for (const resultValue of value.spellResults) {
    const result = validateSpellAnalysisResult(resultValue);
    if (!result) return null;
    spellResults.push(result);
  }

  if (!Array.isArray(value.overallColourSummary)) return null;
  const overallColourSummary: ColourSourceCount[] = [];
  for (const summaryValue of value.overallColourSummary) {
    const summary = validateColourSourceCount(summaryValue);
    if (!summary) return null;
    overallColourSummary.push(summary);
  }

  if (!Array.isArray(value.recommendations)) return null;
  const recommendations: Recommendation[] = [];
  for (const recommendationValue of value.recommendations) {
    const recommendation = validateRecommendation(recommendationValue);
    if (!recommendation) return null;
    recommendations.push(recommendation);
  }

  if (!Array.isArray(value.warnings) || !value.warnings.every(isStringWithinWorkerErrorLimit))
    return null;
  if (
    !Array.isArray(value.assumptions) ||
    !value.assumptions.every(isStringWithinWorkerErrorLimit)
  ) {
    return null;
  }

  const deckName =
    typeof value.deckName === "string"
      ? value.deckName.slice(0, SECURITY_LIMITS.savedDeckNameCharacters)
      : undefined;

  return {
    mode,
    commanderInfo,
    deckName,
    landCount,
    taplandCount,
    totalCards,
    spellResults,
    overallColourSummary,
    recommendations,
    warnings: value.warnings,
    assumptions: value.assumptions,
    timestamp,
  };
}

function validateCommanderInfo(value: unknown): AnalysisReport["commanderInfo"] | null {
  if (!isPlainRecord(value)) return null;
  if (!Array.isArray(value.names) || value.names.length < 1 || value.names.length > 2) return null;
  if (!value.names.every(isSafeCardName)) return null;
  if (
    !Array.isArray(value.colourIdentity) ||
    !value.colourIdentity.every((colour) => VALID_COLOURS.has(colour))
  ) {
    return null;
  }
  if (
    typeof value.count !== "number" ||
    !Number.isInteger(value.count) ||
    value.count < 1 ||
    value.count > 2
  ) {
    return null;
  }
  if (
    typeof value.librarySize !== "number" ||
    !Number.isInteger(value.librarySize) ||
    value.librarySize < 90 ||
    value.librarySize > 100
  ) {
    return null;
  }
  return {
    names: [...value.names],
    colourIdentity: [...value.colourIdentity],
    count: value.count,
    librarySize: value.librarySize,
  };
}

function validateSpellAnalysisResult(value: unknown): SpellAnalysisResult | null {
  if (!isPlainRecord(value)) return null;
  const target = validateSpellTarget(value.target);
  if (!target) return null;

  const heuristicProbability = safeProbability(value.heuristicProbability);
  if (heuristicProbability === undefined) return null;

  let exactProbability: number | null = null;
  if (value.exactProbability !== null) {
    const maybeExact = safeProbability(value.exactProbability);
    if (maybeExact === undefined) return null;
    exactProbability = maybeExact;
  }

  if (typeof value.status !== "string" || !VALID_STATUS.has(value.status as AnalysisStatus))
    return null;
  const status = value.status as AnalysisStatus;

  const notes = Array.isArray(value.notes)
    ? value.notes.filter(isStringWithinWorkerErrorLimit)
    : null;
  if (!notes) return null;

  const colourBottleneck = value.colourBottleneck;
  if (
    colourBottleneck !== null &&
    (typeof colourBottleneck !== "string" || !VALID_COLOURS.has(colourBottleneck as MtgColour))
  ) {
    return null;
  }
  const typedBottleneck = colourBottleneck === null ? null : (colourBottleneck as MtgColour);

  const sourceCounts = validateSourceCounts(value.sourceCounts);
  if (!sourceCounts) return null;

  return {
    target,
    sourceCounts,
    heuristicProbability,
    exactProbability,
    status,
    colourBottleneck: typedBottleneck,
    notes,
  };
}

function validateSpellTarget(value: unknown): SpellTarget | null {
  if (!isPlainRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length < 1 || value.id.length > 200) return null;
  if (!isSafeCardName(value.cardName)) return null;
  const targetTurn = safeInteger(value.targetTurn);
  const totalManaValue = safeInteger(value.totalManaValue);
  const probabilityThreshold = safeProbability(value.probabilityThreshold);
  if (targetTurn === null || totalManaValue === null || probabilityThreshold === undefined)
    return null;
  if (
    typeof value.priorityTier !== "string" ||
    !VALID_PRIORITY.has(value.priorityTier as PriorityTier)
  )
    return null;
  const priorityTier = value.priorityTier as PriorityTier;
  if (typeof value.isAutoDetected !== "boolean") return null;

  const requiredPips = validatePipMap(value.requiredPips);
  if (!requiredPips) return null;

  return {
    id: value.id,
    cardName: value.cardName,
    targetTurn,
    requiredPips,
    totalManaValue,
    probabilityThreshold,
    priorityTier,
    isAutoDetected: value.isAutoDetected,
  };
}

function validatePipMap(value: unknown): SpellTarget["requiredPips"] | null {
  if (!isPlainRecord(value)) return null;
  const pips: SpellTarget["requiredPips"] = {};
  for (const [rawKey, raw] of Object.entries(value)) {
    const key = rawKey as MtgColour;
    if (!VALID_COLOURS.has(key)) return null;
    const count = safeInteger(raw);
    if (count === null || count < 1 || count > 6) return null;
    pips[key] = count;
  }
  return pips;
}

function validateSourceCounts(value: unknown): SpellAnalysisResult["sourceCounts"] | null {
  if (!isPlainRecord(value)) return null;
  const counts: SpellAnalysisResult["sourceCounts"] = {};
  for (const [rawKey, raw] of Object.entries(value)) {
    const key = rawKey as MtgColour;
    if (!VALID_COLOURS.has(key)) return null;
    const summary = validateColourSourceCount(raw);
    if (!summary) return null;
    counts[key] = summary;
  }
  return counts;
}

function validateColourSourceCount(value: unknown): ColourSourceCount | null {
  if (!isPlainRecord(value)) return null;
  if (typeof value.colour !== "string" || !VALID_COLOURS.has(value.colour as MtgColour))
    return null;
  const colour = value.colour as MtgColour;
  const landSources = safeNonNegative(value.landSources);
  const rockSources = safeNonNegative(value.rockSources);
  const totalEffective = safeNonNegative(value.totalEffective);
  const neededSources = safeNonNegative(value.neededSources);
  const deficit = safeFinite(value.deficit);
  if (
    landSources === null ||
    rockSources === null ||
    totalEffective === null ||
    neededSources === null ||
    deficit === null
  ) {
    return null;
  }
  if (
    typeof value.deficitLevel !== "string" ||
    !VALID_DEFICIT_LEVELS.has(value.deficitLevel as DeficitLevel)
  ) {
    return null;
  }
  const deficitLevel = value.deficitLevel as DeficitLevel;
  return {
    colour,
    landSources,
    rockSources,
    totalEffective,
    neededSources,
    deficit,
    deficitLevel,
  };
}

function validateRecommendation(value: unknown): Recommendation | null {
  if (!isPlainRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length < 1 || value.id.length > 200) return null;
  if (
    typeof value.type !== "string" ||
    !VALID_RECOMMENDATION_TYPES.has(value.type as Recommendation["type"])
  ) {
    return null;
  }
  if (
    typeof value.priority !== "string" ||
    !VALID_RECOMMENDATION_PRIORITY.has(value.priority as Recommendation["priority"])
  ) {
    return null;
  }
  const type = value.type as Recommendation["type"];
  const priority = value.priority as Recommendation["priority"];
  if (
    typeof value.description !== "string" ||
    value.description.length < 1 ||
    value.description.length > 500
  ) {
    return null;
  }
  if (
    !Array.isArray(value.affectedColours) ||
    !value.affectedColours.every((colour) => VALID_COLOURS.has(colour))
  ) {
    return null;
  }
  if (!isPlainRecord(value.estimatedSourceDelta)) return null;
  const estimatedSourceDelta: Recommendation["estimatedSourceDelta"] = {};
  for (const [rawKey, raw] of Object.entries(value.estimatedSourceDelta)) {
    const key = rawKey as MtgColour;
    if (!VALID_COLOURS.has(key)) return null;
    const delta = safeFinite(raw);
    if (delta === null) return null;
    estimatedSourceDelta[key] = delta;
  }

  const tradeOffNote =
    typeof value.tradeOffNote === "string" ? value.tradeOffNote.slice(0, 500) : undefined;

  return {
    id: value.id,
    type,
    priority,
    description: value.description,
    affectedColours: [...value.affectedColours],
    estimatedSourceDelta,
    tradeOffNote,
  };
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function safePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeProbability(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= 0 && value <= 1 ? value : undefined;
}

function isStringWithinWorkerErrorLimit(value: unknown): value is string {
  return typeof value === "string" && value.length <= SECURITY_LIMITS.workerErrorCharacters;
}
