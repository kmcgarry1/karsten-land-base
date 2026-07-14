import type {
  CardRecord,
  CommanderInfo,
  MtgColour,
  SpellTarget,
  AnalysisReport,
  SpellAnalysisResult,
  ColourSourceCount,
  DeficitLevel,
  ManaSourceProfile,
  Recommendation,
  SourceContribution,
  SourceExplanation,
} from "../domain/types";
import { ALL_COLOURS } from "../domain/types";
import {
  KARSTEN_COMMANDER_THRESHOLDS,
  karstenThresholdKey,
  ROCK_WEIGHT,
  EXOTIC_ORCHARD_WEIGHT,
  FELLWAR_STONE_WEIGHT,
} from "../domain/constants";
import { estimateCastProbability } from "./hypergeom";
import type { AnalysisSettings } from "../domain/types";

// ─── Source counting ──────────────────────────────────────────────────────────

interface CountOptions {
  colour: MtgColour;
  targetTurn: number;
  isT1Untapped: boolean;
  totalManaValue: number;
  settings: AnalysisSettings;
  commanderIdentity: MtgColour[];
  fetchTargetsInDeck: Set<string>; // land subtypes present in deck
}

/**
 * Returns the effective weight (0–1) this source contributes toward
 * the given colour requirement at the given turn.
 */
function sourceWeight(profile: ManaSourceProfile, opts: CountOptions): number {
  const { colour, targetTurn, isT1Untapped, totalManaValue, settings, commanderIdentity } = opts;

  // Must actually produce the target colour
  if (profile.isColourlessOnly) return 0;
  if (profile.isRainbow) {
    // Rainbow lands produce all colours in commander identity
    if (!commanderIdentity.includes(colour)) return 0;
  } else if (profile.isFetchland) {
    // Fetchlands count only if an in-deck fetch target has the needed subtype.
    const colourFromSubtype: Record<string, MtgColour> = {
      Plains: "W",
      Island: "U",
      Swamp: "B",
      Mountain: "R",
      Forest: "G",
    };
    const couldProduceColour = profile.fetchTargetSubtypes.some((sub) => {
      const c = colourFromSubtype[sub];
      return c === colour && opts.fetchTargetsInDeck.has(sub);
    });
    if (!couldProduceColour) return 0;
  } else if (profile.isMDFC) {
    if (!profile.producedColours.includes(colour)) return 0;
    // MDFC land side: check if user wants to count it and if it ETB tapped
    if (!settings.countMDFCsAsLands) return 0;
    if (isT1Untapped && profile.mdFCLandSideEntersTapped) return 0;
  } else if (!profile.producedColours.includes(colour)) {
    return 0;
  }

  // Opponent-dependent sources
  if (profile.isOpponentDependent) {
    if (profile.cardName === "Exotic Orchard") {
      const podKnows = settings.knownPodColours.includes(colour);
      return podKnows ? 1.0 : settings.countOrchardAsThreeQuarter ? EXOTIC_ORCHARD_WEIGHT : 0;
    }
    if (profile.cardName === "Fellwar Stone") {
      const podKnows = settings.knownPodColours.includes(colour);
      return podKnows ? ROCK_WEIGHT : settings.countFellwarAsHalf ? FELLWAR_STONE_WEIGHT : 0;
    }
  }

  // Turn-one untapped requirement
  if (isT1Untapped) {
    // Only unconditionally-untapped sources count for T1
    switch (profile.untapCondition) {
      case "alwaysTapped":
      case "bounce":
        return 0;
      case "twoOrFewerLands":
        // Fast lands: on T1 you have 0 other lands, so condition is met
        return 1.0;
      case "controlBasicOrType":
        // Check lands: may or may not have a basic on T1 — optimistically 0 for T1
        return 0;
      case "controlTwoBasiscs":
        // Slow lands: unlikely to have 2 basics on T1
        return 0;
      case "payTwoLife":
        // Shocklands: counted as untapped (pay 2 life)
        return 1.0;
      case "none":
      default:
        return 1.0;
    }
  }

  // From turn 2 onward: Karsten's rule — generally count all sources
  // (taplands included, per his optimistic heuristic)
  if (!settings.countTaplandsTurnTwo && profile.isTappedOnEntry) {
    return 0;
  }

  // Two-mana rocks: 0.75 weight for MV 3+ spells, 0 for MV 1–2
  if (profile.sourceType === "twoManaRock" || profile.sourceType === "manaDork") {
    if (totalManaValue < 3) return 0;
    return ROCK_WEIGHT;
  }

  // Turn-two ramp (Nature's Lore, Farseek): available for MV 3+ spells
  if (profile.sourceType === "turnTwoRamp") {
    if (totalManaValue < 3 || targetTurn < 3) return 0;
    return 1.0;
  }

  // Turn-three ramp (Cultivate, Kodama's Reach): available for MV 4+ only
  if (profile.sourceType === "turnThreeRamp") {
    if (totalManaValue < 4 || targetTurn < 4) return 0;
    return 1.0;
  }

  // Colourless-only rocks (Sol Ring etc.)
  if (profile.sourceType === "manaRock") return 0;

  return profile.baseWeight;
}

/**
 * Count effective sources of `colour` for a given spell target
 * across all cards in the deck.
 */
export function countEffectiveSources(
  sourceProfiles: ManaSourceProfile[],
  colour: MtgColour,
  target: SpellTarget,
  settings: AnalysisSettings,
  commanderIdentity: MtgColour[],
  fetchTargetsInDeck: Set<string>,
): number {
  const isT1 = target.targetTurn === 1;
  const opts: CountOptions = {
    colour,
    targetTurn: target.targetTurn,
    isT1Untapped: isT1,
    totalManaValue: target.totalManaValue,
    settings,
    commanderIdentity,
    fetchTargetsInDeck,
  };

  let total = 0;
  for (const profile of sourceProfiles) {
    const weight = sourceWeight(profile, opts);
    if (weight > 0) {
      // quantity is on the CardRecord; profiles are per-unique-card
      total += weight * (profile as ManaSourceProfile & { quantity?: number }).quantity!;
    }
  }

  // Warn-only: if turn 1 requires untapped sources, taplands don't help
  // (handled in sourceWeight above)
  return Math.round(total * 100) / 100; // round to 2dp
}

/** Get Karsten threshold for pips/turn, falling back to interpolation */
export function getKarstenThreshold(pips: number, turn: number): number {
  // Handle turns beyond T6: extrapolate linearly downward
  if (turn > 6) {
    const base6 = getKarstenThreshold(pips, 6)
    return Math.max(0, Math.round(base6 - (turn - 6) * 2))
  }

  const key = karstenThresholdKey(pips, turn)
  if (key in KARSTEN_COMMANDER_THRESHOLDS) return KARSTEN_COMMANDER_THRESHOLDS[key]!

  // Fallback for very high pip counts
  if (pips > 5) return 99
  return 14
}

function deficitLevel(deficit: number): DeficitLevel {
  if (deficit <= 0) return "none";
  if (deficit <= 2) return "low";
  if (deficit <= 5) return "moderate";
  return "high";
}

// ─── Main analysis function ───────────────────────────────────────────────────

export interface KarstenEngineInput {
  deck: CardRecord[];
  commander: CommanderInfo;
  targets: SpellTarget[];
  settings: AnalysisSettings;
  sourceProfiles: Record<string, ManaSourceProfile & { quantity: number }>;
}

export function runKarstenAnalysis(input: KarstenEngineInput): AnalysisReport {
  const { deck, commander, targets, settings, sourceProfiles } = input;
  const profiles = Object.values(sourceProfiles);

  const fetchTargetsInDeck = buildFetchTargetsInDeck(profiles);

  const landCount = deck
    .filter((c) => c.typeLine.toLowerCase().includes("land"))
    .reduce((s, c) => s + c.quantity, 0);

  const taplandCount = profiles
    .filter((p) => p.isTappedOnEntry)
    .reduce((s, p) => s + (p as ManaSourceProfile & { quantity: number }).quantity, 0);

  const warnings: string[] = [];
  const assumptions: string[] = [
    `Library size: ${commander.librarySize} cards (commander${commander.count > 1 ? "s" : ""} in command zone)`,
    `Karsten 2022 land-count assumption: ${input.commander.librarySize === 99 ? 41 : 40} lands for probability tables`,
    `Turn-one plays: only untapped sources counted`,
    settings.countTaplandsTurnTwo
      ? `Turn 2+: all sources counted (Karsten's optimistic tapland rule — may overstate in tapland-heavy decks)`
      : `Turn 2+: only untapped sources counted (strict mode)`,
    `Mana rocks (MV 2): weighted at ${ROCK_WEIGHT} per colour for MV 3+ spells`,
    settings.countOrchardAsThreeQuarter
      ? `Exotic Orchard: ${EXOTIC_ORCHARD_WEIGHT} weight (unknown pod)`
      : `Exotic Orchard: counted at full value (pod colours known)`,
    settings.countFellwarAsHalf
      ? `Fellwar Stone: ${FELLWAR_STONE_WEIGHT} weight (unknown pod)`
      : `Fellwar Stone: counted at full value (pod colours known)`,
  ];

  if (taplandCount > 8) {
    warnings.push(
      `Deck has ${taplandCount} ETB-tapped lands. Karsten's optimistic turn-2+ tapland rule may overstate colour consistency — consider running Exact Simulation mode.`,
    );
  }

  if (landCount < 35) {
    warnings.push(
      `Low land count (${landCount}). Karsten's Commander thresholds assume ~41 lands. You may be more land-screwed than the source counts indicate.`,
    );
  }

  // Compute per-spell results
  const spellResults: SpellAnalysisResult[] = targets.map((target) => {
    const coloursNeeded = Object.keys(target.requiredPips) as MtgColour[];
    const sourceCounts: Partial<Record<MtgColour, ColourSourceCount>> = {};
    let overallProb = 1;
    let bottleneck: MtgColour | null = null;
    let lowestProb = 1;
    const notes: string[] = [];

    for (const colour of coloursNeeded) {
      const pips = target.requiredPips[colour] ?? 1;
      const effective = countEffectiveSources(
        profiles,
        colour,
        target,
        settings,
        commander.colourIdentity,
        fetchTargetsInDeck,
      );
      const needed = getKarstenThreshold(pips, target.targetTurn);
      const deficit = needed - effective;
      const level = deficitLevel(deficit);
      const prob = estimateCastProbability(
        commander.librarySize,
        effective,
        target.targetTurn,
        pips,
      );

      sourceCounts[colour] = {
        colour,
        landSources: countLandSourcesOnly(
          profiles,
          colour,
          target,
          settings,
          commander,
          fetchTargetsInDeck,
        ),
        rockSources: countRockSourcesOnly(profiles, colour, target, settings, commander),
        totalEffective: effective,
        neededSources: needed,
        deficit,
        deficitLevel: level,
      };

      if (prob < lowestProb) {
        lowestProb = prob;
        bottleneck = colour;
      }
      overallProb = Math.min(overallProb, prob);
    }

    // Notes for specific edge cases
    if (target.targetTurn === 1) {
      notes.push("Turn-1 play: only untapped sources count.");
    }
    if (target.totalManaValue < 3) {
      notes.push("MV < 3: mana rocks not counted (need turn to deploy them).");
    }

    const status = overallProb >= target.probabilityThreshold ? "pass" : "fail";

    return {
      target,
      sourceCounts,
      heuristicProbability: overallProb,
      exactProbability: null,
      status,
      colourBottleneck: status === "fail" ? bottleneck : null,
      notes,
    };
  });

  // Overall colour summary across all targets
  const overallColourSummary: ColourSourceCount[] = commander.colourIdentity.map((colour) => {
    // Use the worst-case target for this colour
    let worstNeeded = 0;
    let worstSummary: ColourSourceCount | null = null;
    for (const result of spellResults) {
      const sc = result.sourceCounts[colour];
      if (sc && sc.neededSources > worstNeeded) {
        worstNeeded = sc.neededSources;
        worstSummary = sc;
      }
    }

    if (worstSummary) return worstSummary;

    const coverageTarget = colourCoverageTarget(colour);
    const totalEffective = countEffectiveSources(
      profiles,
      colour,
      coverageTarget,
      settings,
      commander.colourIdentity,
      fetchTargetsInDeck,
    );
    const landSources = countLandSourcesOnly(
      profiles,
      colour,
      coverageTarget,
      settings,
      commander,
      fetchTargetsInDeck,
    );
    const rockSources = countRockSourcesOnly(profiles, colour, coverageTarget, settings, commander);
    const deficit = worstNeeded - totalEffective;

    return {
      colour,
      landSources,
      rockSources,
      totalEffective,
      neededSources: worstNeeded,
      deficit,
      deficitLevel: deficitLevel(deficit),
    };
  });

  const recommendations = buildRecommendations(spellResults, overallColourSummary);

  return {
    mode: "karsten",
    commanderInfo: commander,
    landCount,
    taplandCount,
    totalCards: deck.reduce((s, c) => s + c.quantity, 0),
    spellResults,
    overallColourSummary,
    recommendations,
    warnings,
    assumptions,
    timestamp: Date.now(),
  };
}

export function explainSourcesForTarget(input: {
  target: SpellTarget;
  commander: CommanderInfo;
  settings: AnalysisSettings;
  sourceProfiles: Record<string, ManaSourceProfile & { quantity: number }>;
}): SourceExplanation {
  const profiles = Object.values(input.sourceProfiles);
  const fetchTargetsInDeck = buildFetchTargetsInDeck(profiles);
  const colours = Object.keys(input.target.requiredPips) as MtgColour[];
  const sourceCounts: Partial<Record<MtgColour, ColourSourceCount>> = {};
  const notes: string[] = [];
  const contributions: SourceExplanation["contributions"] = {
    lands: [],
    rocksRamp: [],
    fetches: [],
    conditional: [],
    opponentDependent: [],
  };

  for (const colour of colours) {
    const pips = input.target.requiredPips[colour] ?? 1;
    const effective = countEffectiveSources(
      profiles,
      colour,
      input.target,
      input.settings,
      input.commander.colourIdentity,
      fetchTargetsInDeck,
    );
    const needed = getKarstenThreshold(pips, input.target.targetTurn);
    sourceCounts[colour] = {
      colour,
      landSources: countLandSourcesOnly(
        profiles,
        colour,
        input.target,
        input.settings,
        input.commander,
        fetchTargetsInDeck,
      ),
      rockSources: countRockSourcesOnly(
        profiles,
        colour,
        input.target,
        input.settings,
        input.commander,
      ),
      totalEffective: effective,
      neededSources: needed,
      deficit: needed - effective,
      deficitLevel: deficitLevel(needed - effective),
    };
  }

  for (const profile of profiles) {
    const weightByColour: Partial<Record<MtgColour, number>> = {};
    const produced = new Set<MtgColour>();
    for (const colour of colours) {
      const weight = sourceWeight(profile, {
        colour,
        targetTurn: input.target.targetTurn,
        isT1Untapped: input.target.targetTurn === 1,
        totalManaValue: input.target.totalManaValue,
        settings: input.settings,
        commanderIdentity: input.commander.colourIdentity,
        fetchTargetsInDeck,
      });
      if (weight > 0) {
        weightByColour[colour] = weight;
        produced.add(colour);
      }
    }
    if (produced.size === 0) continue;

    const contribution: SourceContribution = {
      cardName: profile.cardName,
      sourceType: profile.sourceType,
      colours: [...produced],
      weightByColour,
      quantity: profile.quantity,
      entersTapped: profile.isTappedOnEntry,
      note: contributionNote(profile, input.settings),
    };
    contributionGroup(contributions, profile).push(contribution);
  }

  if (input.target.targetTurn === 1) notes.push("Turn 1 only counts untapped sources.");
  if (input.target.totalManaValue < 3) notes.push("MV 1-2 targets do not count two-mana rocks.");
  notes.push("Activated abilities, equip costs, and alternate costs are not modeled in this version.");

  return {
    target: input.target,
    requiredPips: input.target.requiredPips,
    sourceCounts,
    contributions,
    notes,
  };
}

function buildFetchTargetsInDeck(
  profiles: (ManaSourceProfile & { quantity?: number })[],
): Set<string> {
  const fetchTargetsInDeck = new Set<string>();
  for (const profile of profiles) {
    if (profile.isFetchland) continue;
    for (const sub of profile.typedLandSubtypes) fetchTargetsInDeck.add(sub);
  }
  return fetchTargetsInDeck;
}

function contributionGroup(
  groups: SourceExplanation["contributions"],
  profile: ManaSourceProfile,
): SourceContribution[] {
  if (profile.isFetchland) return groups.fetches;
  if (profile.isOpponentDependent) return groups.opponentDependent;
  if (profile.sourceType === "conditionalUntap" || profile.sourceType === "mdfc") return groups.conditional;
  if (
    ["twoManaRock", "manaDork", "turnTwoRamp", "turnThreeRamp", "manaRock"].includes(
      profile.sourceType,
    )
  ) {
    return groups.rocksRamp;
  }
  return groups.lands;
}

function contributionNote(profile: ManaSourceProfile, settings: AnalysisSettings): string {
  if (profile.isMDFC) {
    return settings.countMDFCsAsLands
      ? "MDFC land side counted as a source."
      : "MDFC land side ignored by current settings.";
  }
  if (profile.isOpponentDependent) return "Opponent-dependent source uses pod-colour assumptions.";
  if (profile.isFetchland) return "Counts only for colours with compatible in-deck typed targets.";
  if (profile.untapConditionDescription) return profile.untapConditionDescription;
  if (profile.sourceType === "twoManaRock") return "Weighted as a two-mana rock for MV 3+ targets.";
  return "";
}

function countLandSourcesOnly(
  profiles: (ManaSourceProfile & { quantity?: number })[],
  colour: MtgColour,
  target: SpellTarget,
  settings: AnalysisSettings,
  commander: CommanderInfo,
  fetchTargetsInDeck: Set<string>,
): number {
  const landTypes = [
    "basic",
    "untappedLand",
    "tapland",
    "conditionalUntap",
    "fetchland",
    "pathway",
    "rainbow",
    "bounceLand",
    "mdfc",
  ];
  let total = 0;
  for (const p of profiles) {
    if (!landTypes.includes(p.sourceType)) continue;
    if (!p.producedColours.includes(colour) && !p.isRainbow && !p.isFetchland) continue;
    const weight = sourceWeight(p, {
      colour,
      targetTurn: target.targetTurn,
      isT1Untapped: target.targetTurn === 1,
      totalManaValue: target.totalManaValue,
      settings,
      commanderIdentity: commander.colourIdentity,
      fetchTargetsInDeck,
    });
    total += weight * (p.quantity ?? 1);
  }
  return Math.round(total * 100) / 100;
}

function countRockSourcesOnly(
  profiles: (ManaSourceProfile & { quantity?: number })[],
  colour: MtgColour,
  target: SpellTarget,
  settings: AnalysisSettings,
  commander: CommanderInfo,
): number {
  const rockTypes = [
    "twoManaRock",
    "manaDork",
    "turnTwoRamp",
    "turnThreeRamp",
    "opponentDependent",
  ];
  let total = 0;
  for (const p of profiles) {
    if (!rockTypes.includes(p.sourceType)) continue;
    if (!p.producedColours.includes(colour) && !p.isOpponentDependent) continue;
    const weight = sourceWeight(p, {
      colour,
      targetTurn: target.targetTurn,
      isT1Untapped: target.targetTurn === 1,
      totalManaValue: target.totalManaValue,
      settings,
      commanderIdentity: commander.colourIdentity,
      fetchTargetsInDeck: new Set(),
    });
    total += weight * (p.quantity ?? 1);
  }
  return Math.round(total * 100) / 100;
}

function colourCoverageTarget(colour: MtgColour): SpellTarget {
  return {
    id: `colour-coverage-${colour}`,
    cardName: `${colour} source coverage`,
    targetTurn: 2,
    requiredPips: { [colour]: 1 },
    totalManaValue: 2,
    probabilityThreshold: 0.9,
    priorityTier: "nice",
    isAutoDetected: true,
  };
}

function buildRecommendations(
  spellResults: SpellAnalysisResult[],
  colourSummary: ColourSourceCount[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  let idCounter = 0;

  for (const summary of colourSummary) {
    if (summary.deficit <= 0) continue;
    const deficit = summary.deficit;
    const colour = summary.colour;

    if (deficit > 5) {
      recs.push({
        id: `rec-${idCounter++}`,
        type: "add-land",
        priority: "high",
        description: `Add ${Math.ceil(deficit)} more ${colour} sources. Current: ${summary.totalEffective.toFixed(1)}, needed: ${summary.neededSources} (Karsten 90% threshold).`,
        affectedColours: [colour],
        estimatedSourceDelta: { [colour]: Math.ceil(deficit) } as Partial<
          Record<MtgColour, number>
        >,
        tradeOffNote: "Replace fixing-inefficient lands or low-value colourless sources first.",
      });
    } else if (deficit > 2) {
      recs.push({
        id: `rec-${idCounter++}`,
        type: "swap-for-better-dual",
        priority: "medium",
        description: `${colour} is slightly short (${summary.totalEffective.toFixed(1)} / ${summary.neededSources} needed). Consider replacing taplands with dual lands that include ${colour}.`,
        affectedColours: [colour],
        estimatedSourceDelta: { [colour]: Math.ceil(deficit) } as Partial<
          Record<MtgColour, number>
        >,
      });
    } else {
      recs.push({
        id: `rec-${idCounter++}`,
        type: "info",
        priority: "low",
        description: `${colour} is within 2 sources of the 90% threshold. Functionally acceptable but tight.`,
        affectedColours: [colour],
        estimatedSourceDelta: {},
      });
    }
  }

  // Recommend lowering priority for failing 'nice' spells
  for (const result of spellResults) {
    if (result.status === "fail" && result.target.priorityTier === "nice") {
      recs.push({
        id: `rec-${idCounter++}`,
        type: "lower-requirement",
        priority: "medium",
        description: `"${result.target.cardName}" is below its ${(result.target.probabilityThreshold * 100).toFixed(0)}% threshold. Consider lowering its priority tier to 'late' or accepting the colour constraint.`,
        affectedColours: Object.keys(result.target.requiredPips) as MtgColour[],
        estimatedSourceDelta: {},
        tradeOffNote:
          "Alternatively, switch to Exact Simulation mode for a more accurate assessment.",
      });
    }
  }

  return recs;
}

/** Parse a mana cost string like "{2}{U}{U}" into pip requirements */
export function parsePipRequirements(manaCost: string): Partial<Record<MtgColour, number>> {
  if (!manaCost) return {};
  const pips: Partial<Record<MtgColour, number>> = {};
  const matches = manaCost.matchAll(/\{([WUBRG])\}/gi);
  for (const m of matches) {
    const c = m[1]!.toUpperCase() as MtgColour
    if (ALL_COLOURS.includes(c)) pips[c] = (pips[c] ?? 0) + 1;
  }
  return pips;
}

/** Build SpellTarget from a CardRecord */
export function cardToSpellTarget(
  card: CardRecord,
  priorityTier: "must" | "nice" | "late" = "nice",
): SpellTarget {
  const face = card.faces?.find((face) => {
    const type = face.typeLine.toLowerCase();
    return !type.includes("land") && Object.keys(parsePipRequirements(face.manaCost ?? "")).length > 0;
  });
  const manaCost = face?.manaCost ?? card.manaCost ?? "";
  const cmc = face ? card.cmc : card.cmc;

  return {
    id: `${card.name}-${Date.now()}`,
    cardName: face?.name ?? card.name,
    targetTurn: Math.max(1, Math.min(10, cmc)),
    requiredPips: parsePipRequirements(manaCost),
    totalManaValue: cmc,
    probabilityThreshold: 0.9,
    priorityTier,
    isAutoDetected: true,
  };
}
