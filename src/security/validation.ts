import { DEFAULT_ANALYSIS_SETTINGS } from "../domain/constants";
import type { AnalysisSettings, DeckSnapshot, MtgColour } from "../domain/types";
import { SECURITY_LIMITS, isDeckTextWithinLimits } from "./limits";

const VALID_MODES = new Set(["karsten", "exact"]);
const VALID_COLOURS = new Set<MtgColour>(["W", "U", "B", "R", "G"]);

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isSafeCardName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= SECURITY_LIMITS.cardNameCharacters &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    })
  );
}

export function validateAnalysisSettings(value: unknown): AnalysisSettings {
  if (!isPlainRecord(value)) return { ...DEFAULT_ANALYSIS_SETTINGS, knownPodColours: [] };
  const candidate = value as Partial<AnalysisSettings>;
  const settings: AnalysisSettings = { ...DEFAULT_ANALYSIS_SETTINGS, knownPodColours: [] };

  if (candidate.mode && VALID_MODES.has(candidate.mode)) settings.mode = candidate.mode;
  if (typeof candidate.targetThreshold === "number" && Number.isFinite(candidate.targetThreshold)) {
    settings.targetThreshold = Math.min(0.99, Math.max(0.5, candidate.targetThreshold));
  }
  if (
    typeof candidate.simulationIterations === "number" &&
    Number.isFinite(candidate.simulationIterations)
  ) {
    settings.simulationIterations = Math.trunc(
      Math.min(
        SECURITY_LIMITS.simulationIterationsMax,
        Math.max(SECURITY_LIMITS.simulationIterationsMin, candidate.simulationIterations),
      ),
    );
  }
  if (Array.isArray(candidate.knownPodColours)) {
    settings.knownPodColours = [
      ...new Set(candidate.knownPodColours.filter((colour): colour is MtgColour => VALID_COLOURS.has(colour))),
    ];
  }
  for (const key of [
    "countMDFCsAsLands",
    "countTaplandsTurnTwo",
    "countFellwarAsHalf",
    "countOrchardAsThreeQuarter",
    "usePartnerRule",
  ] as const) {
    if (typeof candidate[key] === "boolean") settings[key] = candidate[key];
  }
  settings.simulationRunning = false;
  settings.simulationProgress = 0;
  return settings;
}

export function validateSavedDecks(value: unknown): DeckSnapshot[] | null {
  if (!Array.isArray(value)) return null;
  const decks: DeckSnapshot[] = [];
  for (const candidate of value.slice(0, SECURITY_LIMITS.savedDecks)) {
    if (!isPlainRecord(candidate)) continue;
    if (
      typeof candidate.id !== "string" ||
      candidate.id.length < 1 ||
      candidate.id.length > 160 ||
      typeof candidate.name !== "string" ||
      candidate.name.trim().length < 1 ||
      candidate.name.length > SECURITY_LIMITS.savedDeckNameCharacters ||
      typeof candidate.rawText !== "string" ||
      !isDeckTextWithinLimits(candidate.rawText) ||
      !Array.isArray(candidate.commanderNames) ||
      candidate.commanderNames.length > 2 ||
      !candidate.commanderNames.every(isSafeCardName) ||
      typeof candidate.createdAt !== "number" ||
      !Number.isFinite(candidate.createdAt) ||
      candidate.createdAt < 0 ||
      typeof candidate.updatedAt !== "number" ||
      !Number.isFinite(candidate.updatedAt) ||
      candidate.updatedAt < 0
    ) {
      continue;
    }
    decks.push({
      id: candidate.id,
      name: candidate.name.trim(),
      rawText: candidate.rawText,
      commanderNames: [...candidate.commanderNames],
      settings: validateAnalysisSettings(candidate.settings),
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    });
  }
  return decks;
}
