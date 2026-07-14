import type { SimulationInput, SimulationOutput, WorkerMessage } from "../domain/types";
import { SECURITY_LIMITS, simulationLimitError } from "./limits";
import { isPlainRecord, isSafeCardName } from "./validation";

export function isSafeSimulationInput(value: unknown): value is SimulationInput {
  if (!isPlainRecord(value)) return false;
  const input = value as Partial<SimulationInput>;
  if (
    !Array.isArray(input.deck) ||
    input.deck.length > SECURITY_LIMITS.deckEntries ||
    !input.deck.every(
      (card) =>
        isPlainRecord(card) &&
        isSafeCardName(card.name) &&
        typeof card.typeLine === "string" &&
        card.typeLine.length <= 1_000 &&
        Array.isArray(card.colourIdentity) &&
        card.colourIdentity.length <= 5 &&
        card.colourIdentity.every(isColour) &&
        typeof card.cmc === "number" &&
        Number.isFinite(card.cmc) &&
        card.cmc >= 0 &&
        card.cmc <= 1_000 &&
        Number.isInteger(card.quantity) &&
        card.quantity >= SECURITY_LIMITS.cardQuantityMin &&
        card.quantity <= SECURITY_LIMITS.cardQuantityMax,
    ) ||
    input.deck.reduce((total, card) => total + card.quantity, 0) > SECURITY_LIMITS.simulationCards ||
    !isPlainRecord(input.commander) ||
    !Array.isArray(input.commander.names) ||
    input.commander.names.length < 1 ||
    input.commander.names.length > 2 ||
    !input.commander.names.every(isSafeCardName) ||
    !Array.isArray(input.commander.colourIdentity) ||
    input.commander.colourIdentity.length > 5 ||
    !input.commander.colourIdentity.every(isColour) ||
    !Number.isInteger(input.commander.count) ||
    input.commander.count < 1 ||
    input.commander.count > 2 ||
    !Number.isInteger(input.commander.librarySize) ||
    input.commander.librarySize < 1 ||
    input.commander.librarySize > 1_000 ||
    !Array.isArray(input.targets) ||
    !input.targets.every(isSafeTarget) ||
    !isSafeSettings(input.settings) ||
    !isPlainRecord(input.sourceProfiles) ||
    Object.keys(input.sourceProfiles).length > SECURITY_LIMITS.deckEntries ||
    !Object.entries(input.sourceProfiles).every(([name, profile]) =>
      isSafeSourceProfile(name, profile),
    ) ||
    typeof input.iterations !== "number" ||
    simulationLimitError(input.iterations, input.targets.length)
  ) {
    return false;
  }
  return true;
}

function isColour(value: unknown): boolean {
  return typeof value === "string" && ["W", "U", "B", "R", "G"].includes(value);
}

function isSafeSettings(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  return (
    (value.mode === "karsten" || value.mode === "exact") &&
    Array.isArray(value.knownPodColours) &&
    value.knownPodColours.length <= 5 &&
    value.knownPodColours.every(isColour) &&
    typeof value.targetThreshold === "number" &&
    Number.isFinite(value.targetThreshold) &&
    value.targetThreshold >= 0.5 &&
    value.targetThreshold <= 0.99 &&
    typeof value.simulationIterations === "number" &&
    !simulationLimitError(value.simulationIterations, 1) &&
    [
      "countMDFCsAsLands",
      "countTaplandsTurnTwo",
      "countFellwarAsHalf",
      "countOrchardAsThreeQuarter",
      "usePartnerRule",
    ].every((key) => typeof value[key] === "boolean")
  );
}

function isSafeSourceProfile(name: string, value: unknown): boolean {
  if (!isSafeCardName(name) || !isPlainRecord(value) || !isSafeCardName(value.cardName)) return false;
  const stringArrays = ["typedLandSubtypes", "fetchTargetSubtypes"];
  const booleans = [
    "isTappedOnEntry",
    "isOpponentDependent",
    "requiresSummoningTurn",
    "isFetchland",
    "isMDFC",
    "mdFCLandSideEntersTapped",
    "isColourlessOnly",
    "isBasicLand",
    "isRainbow",
  ];
  return (
    typeof value.sourceType === "string" &&
    value.sourceType.length <= 100 &&
    Array.isArray(value.producedColours) &&
    value.producedColours.length <= 5 &&
    value.producedColours.every(isColour) &&
    stringArrays.every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].length <= 10 &&
        value[key].every((item: unknown) => typeof item === "string" && item.length <= 100),
    ) &&
    booleans.every((key) => typeof value[key] === "boolean") &&
    typeof value.untapCondition === "string" &&
    value.untapCondition.length <= 100 &&
    typeof value.untapConditionDescription === "string" &&
    value.untapConditionDescription.length <= 1_000 &&
    ["activationCostGeneric", "availableFromTurn", "baseWeight"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    )
  );
}

function isSafeTarget(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 512 &&
    isSafeCardName(value.cardName) &&
    Number.isInteger(value.targetTurn) &&
    (value.targetTurn as number) >= 1 &&
    (value.targetTurn as number) <= 100 &&
    isPlainRecord(value.requiredPips) &&
    Object.entries(value.requiredPips).every(
      ([colour, count]) =>
        ["W", "U", "B", "R", "G"].includes(colour) &&
        Number.isInteger(count) &&
        (count as number) >= 0 &&
        (count as number) <= 100,
    ) &&
    typeof value.totalManaValue === "number" &&
    Number.isFinite(value.totalManaValue) &&
    value.totalManaValue >= 0 &&
    value.totalManaValue <= 1_000 &&
    typeof value.probabilityThreshold === "number" &&
    Number.isFinite(value.probabilityThreshold) &&
    value.probabilityThreshold >= 0.5 &&
    value.probabilityThreshold <= 0.99
  );
}

export function isSafeWorkerMessage(
  value: unknown,
  expectedTargetIds?: ReadonlySet<string>,
): value is Exclude<WorkerMessage, { type: "start" }> {
  if (!isPlainRecord(value)) return false;
  if (value.type === "progress") {
    return (
      isPlainRecord(value.payload) &&
      typeof value.payload.progress === "number" &&
      Number.isFinite(value.payload.progress) &&
      value.payload.progress >= 0 &&
      value.payload.progress <= 1
    );
  }
  if (value.type === "error") {
    return (
      isPlainRecord(value.payload) &&
      typeof value.payload.message === "string" &&
      value.payload.message.length <= SECURITY_LIMITS.workerErrorCharacters
    );
  }
  if (value.type !== "result" || !isSafeSimulationOutput(value.payload)) return false;
  if (!expectedTargetIds) return true;
  return Object.keys(value.payload.probabilities).every((id) => expectedTargetIds.has(id));
}

function isSafeSimulationOutput(value: unknown): value is SimulationOutput {
  if (!isPlainRecord(value) || !isPlainRecord(value.probabilities)) return false;
  const entries = Object.entries(value.probabilities);
  return (
    entries.length <= SECURITY_LIMITS.simulationTargets &&
    entries.every(
      ([id, probability]) =>
        id.length > 0 &&
        id.length <= 512 &&
        typeof probability === "number" &&
        Number.isFinite(probability) &&
        probability >= 0 &&
        probability <= 1,
    ) &&
    typeof value.iterations === "number" &&
    Number.isFinite(value.iterations) &&
    value.iterations >= 0 &&
    value.iterations <= SECURITY_LIMITS.simulationIterationsMax &&
    typeof value.durationMs === "number" &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0
  );
}
