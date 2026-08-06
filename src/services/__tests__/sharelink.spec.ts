import { describe, expect, it } from "vitest";
import type { AnalysisReport, SharedAnalysisPayload, SpellTarget } from "../../domain/types";
import {
  SharePayloadError,
  createSharedPayload,
  decodeSharedPayload,
  encodeSharedPayload,
} from "../sharelink";

function target(overrides: Partial<SpellTarget> = {}): SpellTarget {
  return {
    id: "spell-1",
    cardName: "Counterspell",
    targetTurn: 2,
    requiredPips: { U: 2 },
    totalManaValue: 2,
    probabilityThreshold: 0.9,
    priorityTier: "must",
    isAutoDetected: false,
    ...overrides,
  };
}

function report(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    mode: "karsten",
    commanderInfo: {
      names: ["Talrand, Sky Summoner"],
      colourIdentity: ["U"],
      count: 1,
      librarySize: 99,
    },
    deckName: "Blue Tempo",
    landCount: 35,
    taplandCount: 4,
    totalCards: 99,
    spellResults: [
      {
        target: target(),
        sourceCounts: {},
        heuristicProbability: 0.91,
        exactProbability: null,
        status: "pass",
        colourBottleneck: null,
        notes: [],
      },
    ],
    overallColourSummary: [
      {
        colour: "U",
        landSources: 32,
        rockSources: 3,
        totalEffective: 35,
        neededSources: 18,
        deficit: 0,
        deficitLevel: "none",
      },
    ],
    recommendations: [],
    warnings: [],
    assumptions: [],
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("sharelink codec", () => {
  it("round-trips a valid payload", () => {
    const payload = createSharedPayload({
      report: report(),
      deckName: "Blue Tempo",
      rawText: "1 Talrand, Sky Summoner",
      settings: {
        mode: "karsten",
        knownPodColours: ["U"],
        targetThreshold: 0.9,
        simulationIterations: 50000,
        countMDFCsAsLands: true,
        countTaplandsTurnTwo: true,
        countFellwarAsHalf: true,
        countOrchardAsThreeQuarter: true,
        usePartnerRule: false,
        simulationRunning: false,
        simulationProgress: 0,
      },
      targets: [target()],
      now: Date.now(),
    });

    const encoded = encodeSharedPayload(payload);
    const decoded = decodeSharedPayload(encoded);

    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.report.deckName).toBe("Blue Tempo");
    expect(decoded.fallback.targets).toHaveLength(1);
  });

  it("rejects tampered payloads", () => {
    const payload = createSharedPayload({
      report: report(),
      deckName: "Blue Tempo",
      rawText: "1 Talrand, Sky Summoner",
      settings: {
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
      },
      targets: [target()],
      now: Date.now(),
    });

    const encoded = encodeSharedPayload(payload);
    expect(() => decodeSharedPayload(encoded.slice(0, -5))).toThrowError(SharePayloadError);
  });

  it("rejects expired payloads", () => {
    const expiredPayload: SharedAnalysisPayload = {
      schemaVersion: 1,
      createdAt: Date.now() - 1000 * 60 * 60,
      expiresAt: Date.now() - 1000,
      report: report(),
      fallback: {
        deckName: "Blue Tempo",
        rawText: "1 Talrand, Sky Summoner",
        settings: {
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
        },
        targets: [target()],
      },
    };

    const encoded = encodeSharedPayload(expiredPayload);
    expect(() => decodeSharedPayload(encoded)).toThrowError(SharePayloadError);
  });
});
