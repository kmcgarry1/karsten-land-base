export const SECURITY_LIMITS = Object.freeze({
  deckTextCharacters: 100_000,
  deckLines: 2_000,
  deckEntries: 500,
  cardNameCharacters: 256,
  cardQuantityMin: 1,
  cardQuantityMax: 999,
  savedDecks: 50,
  savedDeckNameCharacters: 120,
  simulationIterationsMin: 1_000,
  simulationIterationsMax: 200_000,
  simulationTargets: 500,
  simulationCards: 1_000,
  simulationWorkBudget: 20_000_000,
  simulationTimeoutMs: 60_000,
  remoteTextCharacters: 20_000,
  workerErrorCharacters: 500,
  sharePayloadEncodedCharacters: 12_000,
  sharePayloadDecodedCharacters: 80_000,
  sharePayloadMaxAgeMs: 1000 * 60 * 60 * 24 * 30,
});

export function isDeckTextWithinLimits(text: string): boolean {
  if (text.length > SECURITY_LIMITS.deckTextCharacters) return false;
  return text.split(/\r?\n/, SECURITY_LIMITS.deckLines + 1).length <= SECURITY_LIMITS.deckLines;
}

export function simulationLimitError(iterations: number, targetCount: number): string | null {
  if (
    !Number.isInteger(iterations) ||
    iterations < SECURITY_LIMITS.simulationIterationsMin ||
    iterations > SECURITY_LIMITS.simulationIterationsMax
  ) {
    return `Simulation iterations must be between ${SECURITY_LIMITS.simulationIterationsMin} and ${SECURITY_LIMITS.simulationIterationsMax}.`;
  }
  if (
    !Number.isInteger(targetCount) ||
    targetCount < 1 ||
    targetCount > SECURITY_LIMITS.simulationTargets
  ) {
    return `Simulation targets must be between 1 and ${SECURITY_LIMITS.simulationTargets}.`;
  }
  if (iterations * targetCount > SECURITY_LIMITS.simulationWorkBudget) {
    return "This simulation is too large. Reduce the selected cards or simulation iterations.";
  }
  return null;
}
