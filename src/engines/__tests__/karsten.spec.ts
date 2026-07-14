import { describe, it, expect } from "vitest";
import {
  parsePipRequirements,
  getKarstenThreshold,
  cardToSpellTarget,
  explainSourcesForTarget,
  runKarstenAnalysis,
} from "../karsten";
import type { CardRecord, CommanderInfo, ManaSourceProfile } from "../../domain/types";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../domain/constants";

describe("parsePipRequirements", () => {
  it("parses single pip", () => {
    expect(parsePipRequirements("{1}{U}")).toEqual({ U: 1 });
  });

  it("parses double pip", () => {
    expect(parsePipRequirements("{U}{U}")).toEqual({ U: 2 });
  });

  it("parses multi-colour", () => {
    expect(parsePipRequirements("{2}{U}{B}")).toEqual({ U: 1, B: 1 });
  });

  it("parses triple pip in one colour", () => {
    expect(parsePipRequirements("{G}{G}{G}")).toEqual({ G: 3 });
  });

  it("parses WUBRG spell", () => {
    const pips = parsePipRequirements("{W}{U}{B}{R}{G}");
    expect(pips).toEqual({ W: 1, U: 1, B: 1, R: 1, G: 1 });
  });

  it("returns empty for colourless spell", () => {
    expect(parsePipRequirements("{3}")).toEqual({});
  });

  it("returns empty for empty string", () => {
    expect(parsePipRequirements("")).toEqual({});
  });
});

describe("getKarstenThreshold", () => {
  it("returns 19 for 1 pip at T1", () => {
    expect(getKarstenThreshold(1, 1)).toBe(19);
  });

  it("returns 18 for 1 pip at T2", () => {
    expect(getKarstenThreshold(1, 2)).toBe(18);
  });

  it("returns 27 for 2 pips at T3", () => {
    expect(getKarstenThreshold(2, 3)).toBe(27);
  });

  it("returns 24 for 2 pips at T4", () => {
    expect(getKarstenThreshold(2, 4)).toBe(24);
  });

  it("returns 35 for 3 pips at T3", () => {
    expect(getKarstenThreshold(3, 3)).toBe(35);
  });

  it("returns 38 for 4 pips at T4", () => {
    expect(getKarstenThreshold(4, 4)).toBe(38);
  });

  it("caps at T6 for late turns", () => {
    const t6 = getKarstenThreshold(1, 6);
    const t8 = getKarstenThreshold(1, 8);
    // Should extrapolate downward from T6
    expect(t8).toBeLessThan(t6);
  });
});

describe("cardToSpellTarget", () => {
  const baseCard: CardRecord = {
    name: "Counterspell",
    typeLine: "Instant",
    manaCost: "{U}{U}",
    colourIdentity: ["U"],
    cmc: 2,
    quantity: 1,
  };

  it("extracts double blue pip requirement", () => {
    const target = cardToSpellTarget(baseCard);
    expect(target.requiredPips).toEqual({ U: 2 });
    expect(target.targetTurn).toBe(2);
    expect(target.totalManaValue).toBe(2);
  });

  it("marks as auto-detected", () => {
    const target = cardToSpellTarget(baseCard);
    expect(target.isAutoDetected).toBe(true);
  });

  it("respects priority tier", () => {
    const target = cardToSpellTarget(baseCard, "must");
    expect(target.priorityTier).toBe("must");
  });
});

describe("runKarstenAnalysis", () => {
  function basicProfile(
    cardName: string,
    producedColours: ManaSourceProfile["producedColours"],
  ): ManaSourceProfile & { quantity: number } {
    return {
      cardName,
      sourceType: "basic",
      producedColours,
      typedLandSubtypes: cardName === "Swamp" ? ["Swamp"] : ["Plains"],
      isTappedOnEntry: false,
      untapCondition: "none",
      untapConditionDescription: "",
      activationCostGeneric: 0,
      isOpponentDependent: false,
      requiresSummoningTurn: false,
      isFetchland: false,
      fetchTargetSubtypes: [],
      isMDFC: false,
      mdFCLandSideEntersTapped: false,
      isColourlessOnly: false,
      isBasicLand: true,
      isRainbow: false,
      availableFromTurn: 1,
      baseWeight: 1,
      quantity: cardName === "Swamp" ? 6 : 9,
    };
  }

  it("shows source coverage for commander colours without a detected benchmark target", () => {
    const report = runKarstenAnalysis({
      deck: [
        {
          name: "Plains",
          typeLine: "Basic Land — Plains",
          colourIdentity: [],
          cmc: 0,
          quantity: 9,
        },
        {
          name: "Swamp",
          typeLine: "Basic Land — Swamp",
          colourIdentity: [],
          cmc: 0,
          quantity: 6,
        },
      ],
      commander: {
        names: ["Test Commander"],
        colourIdentity: ["W", "B"],
        count: 1,
        librarySize: 99,
      },
      targets: [
        {
          id: "white-target",
          cardName: "White Target",
          targetTurn: 2,
          requiredPips: { W: 1 },
          totalManaValue: 2,
          probabilityThreshold: 0.9,
          priorityTier: "must",
          isAutoDetected: true,
        },
      ],
      settings: DEFAULT_ANALYSIS_SETTINGS,
      sourceProfiles: {
        Plains: basicProfile("Plains", ["W"]),
        Swamp: basicProfile("Swamp", ["B"]),
      },
    });

    const blackSummary = report.overallColourSummary.find((summary) => summary.colour === "B");

    expect(blackSummary?.neededSources).toBe(0);
    expect(blackSummary?.landSources).toBe(6);
    expect(blackSummary?.totalEffective).toBe(6);
  });

  it("only counts fetchlands for colours with compatible in-deck typed targets", () => {
    const marshFlats: ManaSourceProfile & { quantity: number } = {
      ...basicProfile("Plains", ["W"]),
      cardName: "Marsh Flats",
      sourceType: "fetchland",
      producedColours: [],
      typedLandSubtypes: [],
      isBasicLand: false,
      isFetchland: true,
      fetchTargetSubtypes: ["Plains", "Swamp"],
      quantity: 1,
    };
    const report = runKarstenAnalysis({
      deck: [
        {
          name: "Plains",
          typeLine: "Basic Land — Plains",
          colourIdentity: [],
          cmc: 0,
          quantity: 1,
        },
        {
          name: "Marsh Flats",
          typeLine: "Land",
          colourIdentity: [],
          cmc: 0,
          quantity: 1,
        },
      ],
      commander: {
        names: ["Test Commander"],
        colourIdentity: ["W", "B"],
        count: 1,
        librarySize: 99,
      },
      targets: [
        {
          id: "black-target",
          cardName: "Black Target",
          targetTurn: 2,
          requiredPips: { B: 1 },
          totalManaValue: 2,
          probabilityThreshold: 0.9,
          priorityTier: "must",
          isAutoDetected: true,
        },
      ],
      settings: DEFAULT_ANALYSIS_SETTINGS,
      sourceProfiles: {
        Plains: { ...basicProfile("Plains", ["W"]), quantity: 1 },
        "Marsh Flats": marshFlats,
      },
    });

    expect(report.spellResults[0]?.sourceCounts.B?.totalEffective).toBe(0);
  });

  it("source explanation totals match analysis source counts", () => {
    const target = {
      id: "white-target",
      cardName: "White Target",
      targetTurn: 2,
      requiredPips: { W: 1 },
      totalManaValue: 2,
      probabilityThreshold: 0.9,
      priorityTier: "must" as const,
      isAutoDetected: true,
    };
    const sourceProfiles = {
      Plains: basicProfile("Plains", ["W"]),
    };
    const commander: CommanderInfo = {
      names: ["Test Commander"],
      colourIdentity: ["W"],
      count: 1,
      librarySize: 99,
    };
    const report = runKarstenAnalysis({
      deck: [
        {
          name: "Plains",
          typeLine: "Basic Land — Plains",
          colourIdentity: [],
          cmc: 0,
          quantity: 9,
        },
      ],
      commander,
      targets: [target],
      settings: DEFAULT_ANALYSIS_SETTINGS,
      sourceProfiles,
    });
    const explanation = explainSourcesForTarget({
      target,
      commander,
      settings: DEFAULT_ANALYSIS_SETTINGS,
      sourceProfiles,
    });

    expect(explanation.sourceCounts.W?.totalEffective).toBe(
      report.spellResults[0]?.sourceCounts.W?.totalEffective,
    );
    expect(explanation.contributions.lands[0]?.cardName).toBe("Plains");
  });
});
