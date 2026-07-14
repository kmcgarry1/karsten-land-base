import type {
  ScryfallCard,
  ManaSourceProfile,
  MtgColour,
  SourceType,
  UntapConditionType,
} from "../domain/types";
import {
  BASIC_LAND_SUBTYPES,
  BASIC_SUBTYPE_TO_COLOUR,
  FETCHLAND_TARGETS,
  RAINBOW_LANDS,
  TURN_TWO_RAMP_SPELLS,
  TURN_THREE_RAMP_SPELLS,
  OPPONENT_DEPENDENT_CARDS,
} from "../domain/constants";

// ─── Oracle-text pattern helpers ──────────────────────────────────────────────

function text(card: ScryfallCard): string {
  return (card.oracle_text ?? "").toLowerCase();
}

function faceText(card: ScryfallCard, faceIdx: number): string {
  return (card.card_faces?.[faceIdx]?.oracle_text ?? "").toLowerCase();
}

function typeLine(card: ScryfallCard): string {
  return (card.type_line ?? "").toLowerCase();
}

function isLand(card: ScryfallCard): boolean {
  return typeLine(card).includes("land");
}

function isCreature(card: ScryfallCard): boolean {
  return typeLine(card).includes("creature");
}

function isArtifact(card: ScryfallCard): boolean {
  return typeLine(card).includes("artifact");
}

function isInstantOrSorcery(card: ScryfallCard): boolean {
  const t = typeLine(card);
  return t.includes("instant") || t.includes("sorcery");
}

function isBasicLand(card: ScryfallCard): boolean {
  return typeLine(card).includes("basic") && isLand(card);
}

/** Extract typed land subtypes present in the type line */
function extractLandSubtypes(card: ScryfallCard): string[] {
  const subtypes: string[] = [];
  const tl = card.type_line ?? "";
  for (const subtype of BASIC_LAND_SUBTYPES) {
    if (tl.includes(subtype)) subtypes.push(subtype);
  }
  return subtypes;
}

/** Extract colours produced from Scryfall produced_mana or colour identity */
function extractProducedColours(card: ScryfallCard): MtgColour[] {
  const validColours: MtgColour[] = ["W", "U", "B", "R", "G"];
  if (card.produced_mana) {
    return card.produced_mana.filter((c): c is MtgColour => validColours.includes(c as MtgColour));
  }
  return card.color_identity.filter((c): c is MtgColour => validColours.includes(c as MtgColour));
}

function extractFaceProducedColours(card: ScryfallCard, faceIdx: number): MtgColour[] {
  const validColours: MtgColour[] = ["W", "U", "B", "R", "G"];
  const face = card.card_faces?.[faceIdx];
  if (!face) return [];
  if (face.produced_mana) {
    return face.produced_mana.filter((c): c is MtgColour => validColours.includes(c as MtgColour));
  }
  return (face.colors ?? []).filter((c): c is MtgColour => validColours.includes(c as MtgColour));
}

// ─── ETB-tapped pattern detection ────────────────────────────────────────────

function detectUntapCondition(card: ScryfallCard): {
  isTapped: boolean;
  condition: UntapConditionType;
  description: string;
} {
  const t = text(card);

  // Shockland pattern: "you may pay 2 life. If you don't, it enters the battlefield tapped."
  // Must check BEFORE the generic "enters tapped" block
  if (t.includes('you may pay 2 life') || t.includes('unless you pay 2 life')) {
    return {
      isTapped: true,
      condition: 'payTwoLife',
      description: 'Enters tapped unless you pay 2 life (shockland)',
    }
  }

  if (t.includes("enters tapped") || t.includes("enters the battlefield tapped")) {
    // Unconditional tapped — check for conditions
    if (t.includes("unless you control two or fewer other lands")) {
      return {
        isTapped: true,
        condition: "twoOrFewerLands",
        description: "Enters tapped unless you control 2 or fewer other lands (fast land)",
      };
    }
    if (t.includes("unless you control two or more basic lands")) {
      return {
        isTapped: true,
        condition: "controlTwoBasiscs",
        description: "Enters tapped unless you control 2+ basics (slow land)",
      };
    }
    if (t.match(/unless you control a .+ or a /)) {
      return {
        isTapped: true,
        condition: "controlBasicOrType",
        description: "Enters tapped unless you control a matching basic or typed land (check land)",
      };
    }
    if (t.includes("unless you control a basic land")) {
      return {
        isTapped: true,
        condition: "controlBasicOrType",
        description: "Enters tapped unless you control a basic land",
      };
    }
    if (t.includes("return a land you control")) {
      return {
        isTapped: true,
        condition: "bounce",
        description: "Enters tapped and bounces another land (bounce land)",
      };
    }
    return { isTapped: true, condition: "alwaysTapped", description: "Always enters tapped" };
  }

  // Shockland pattern where "tapped unless" appears without "enters"
  // (handled above — no-op fallthrough)

  return { isTapped: false, condition: "none", description: "" };
}

// ─── MDFC detection ───────────────────────────────────────────────────────────

function detectMDFC(card: ScryfallCard): {
  isMDFC: boolean;
  landFaceIndex: number | null;
  landSideEntersTapped: boolean;
  landFaceColours: MtgColour[];
} {
  if (!card.card_faces || card.card_faces.length < 2) {
    return { isMDFC: false, landFaceIndex: null, landSideEntersTapped: false, landFaceColours: [] };
  }

  const landFaceIdx = card.card_faces.findIndex((f) =>
    (f.type_line ?? "").toLowerCase().includes("land"),
  );

  if (landFaceIdx === -1) {
    return { isMDFC: false, landFaceIndex: null, landSideEntersTapped: false, landFaceColours: [] };
  }

  const landFaceText = faceText(card, landFaceIdx);
  const landSideEntersTapped =
    landFaceText.includes("enters tapped") ||
    landFaceText.includes("enters the battlefield tapped");

  return {
    isMDFC: true,
    landFaceIndex: landFaceIdx,
    landSideEntersTapped,
    landFaceColours: extractFaceProducedColours(card, landFaceIdx),
  };
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/** Classify a Scryfall card into a ManaSourceProfile. Returns null if not a mana source. */
export function classifyCard(card: ScryfallCard): ManaSourceProfile | null {
  const name = card.name;

  // ── Rainbow lands
  if (RAINBOW_LANDS.has(name) && isLand(card)) {
    const { isTapped, condition } = detectUntapCondition(card);
    return {
      cardName: name,
      sourceType: "rainbow",
      producedColours: [], // signals: use commander identity
      typedLandSubtypes: extractLandSubtypes(card),
      isTappedOnEntry: isTapped,
      untapCondition: condition,
      untapConditionDescription: isTapped ? "Enters tapped" : "",
      activationCostGeneric: 0,
      isOpponentDependent: false,
      requiresSummoningTurn: false,
      isFetchland: false,
      fetchTargetSubtypes: [],
      isMDFC: false,
      mdFCLandSideEntersTapped: false,
      isColourlessOnly: false,
      isBasicLand: false,
      isRainbow: true,
      availableFromTurn: isTapped ? 2 : 1,
      baseWeight: 1.0,
    };
  }

  // ── Opponent-dependent
  if (OPPONENT_DEPENDENT_CARDS.has(name)) {
    if (name === "Sol Ring") {
      return {
        cardName: name,
        sourceType: "manaRock",
        producedColours: [],
        typedLandSubtypes: [],
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
        isColourlessOnly: true,
        isBasicLand: false,
        isRainbow: false,
        availableFromTurn: 1,
        baseWeight: 0,
      };
    }
    const produced = extractProducedColours(card);
    return {
      cardName: name,
      sourceType: "opponentDependent",
      producedColours: produced,
      typedLandSubtypes: [],
      isTappedOnEntry: isLand(card) ? detectUntapCondition(card).isTapped : false,
      untapCondition: isLand(card) ? detectUntapCondition(card).condition : "none",
      untapConditionDescription: isLand(card) ? detectUntapCondition(card).description : "",
      activationCostGeneric: isArtifact(card) ? 1 : 0,
      isOpponentDependent: true,
      requiresSummoningTurn: false,
      isFetchland: false,
      fetchTargetSubtypes: [],
      isMDFC: false,
      mdFCLandSideEntersTapped: false,
      isColourlessOnly: false,
      isBasicLand: false,
      isRainbow: false,
      availableFromTurn: isArtifact(card) ? 3 : 1,
      baseWeight: 0.75,
    };
  }

  // ── Fetchlands
  if (name in FETCHLAND_TARGETS) {
    return {
      cardName: name,
      sourceType: "fetchland",
      producedColours: [], // derived from fetch targets
      typedLandSubtypes: [],
      isTappedOnEntry: false,
      untapCondition: "none",
      untapConditionDescription: "",
      activationCostGeneric: 0,
      isOpponentDependent: false,
      requiresSummoningTurn: false,
      isFetchland: true,
      fetchTargetSubtypes: FETCHLAND_TARGETS[name]!,
      isMDFC: false,
      mdFCLandSideEntersTapped: false,
      isColourlessOnly: false,
      isBasicLand: false,
      isRainbow: false,
      availableFromTurn: 1,
      baseWeight: 1.0,
    };
  }

  // ── Fetchlands detected via oracle text
  const t = text(card);
  if (isLand(card) && t.includes("search your library for a") && t.includes("land card")) {
    const subtypes: string[] = [];
    for (const s of BASIC_LAND_SUBTYPES) {
      if (t.includes(s.toLowerCase())) subtypes.push(s);
    }
    return {
      cardName: name,
      sourceType: "fetchland",
      producedColours: [],
      typedLandSubtypes: [],
      isTappedOnEntry: true, // most search lands ETB tapped
      untapCondition: "alwaysTapped",
      untapConditionDescription: "Sacrifices itself to find a land",
      activationCostGeneric: 0,
      isOpponentDependent: false,
      requiresSummoningTurn: false,
      isFetchland: true,
      fetchTargetSubtypes: subtypes.length > 0 ? subtypes : [...BASIC_LAND_SUBTYPES],
      isMDFC: false,
      mdFCLandSideEntersTapped: false,
      isColourlessOnly: false,
      isBasicLand: false,
      isRainbow: false,
      availableFromTurn: 1,
      baseWeight: 1.0,
    };
  }

  // ── MDFC (land // spell)
  const mdfcInfo = detectMDFC(card);
  if (mdfcInfo.isMDFC && mdfcInfo.landFaceColours.length > 0) {
    const { isTapped, condition, description } = mdfcInfo.landSideEntersTapped
      ? {
          isTapped: true,
          condition: "alwaysTapped" as UntapConditionType,
          description: "Land side enters tapped",
        }
      : { isTapped: false, condition: "none" as UntapConditionType, description: "" };
    const landFaceCard = card.card_faces?.[mdfcInfo.landFaceIndex!];
    const landSubtypes: string[] = [];
    for (const s of BASIC_LAND_SUBTYPES) {
      if ((landFaceCard?.type_line ?? "").includes(s)) landSubtypes.push(s);
    }
    return {
      cardName: name,
      sourceType: "mdfc",
      producedColours: mdfcInfo.landFaceColours,
      typedLandSubtypes: landSubtypes,
      isTappedOnEntry: isTapped,
      untapCondition: condition,
      untapConditionDescription: description,
      activationCostGeneric: 0,
      isOpponentDependent: false,
      requiresSummoningTurn: false,
      isFetchland: false,
      fetchTargetSubtypes: [],
      isMDFC: true,
      mdFCLandSideEntersTapped: isTapped,
      isColourlessOnly: false,
      isBasicLand: false,
      isRainbow: false,
      availableFromTurn: isTapped ? 2 : 1,
      baseWeight: 1.0,
    };
  }

  // ── Basic lands
  if (isBasicLand(card)) {
    const subtypes = extractLandSubtypes(card);
    const produced: MtgColour[] = subtypes.map((s) => BASIC_SUBTYPE_TO_COLOUR[s]).filter((c): c is MtgColour => !!c)
    return {
      cardName: name,
      sourceType: "basic",
      producedColours: produced,
      typedLandSubtypes: subtypes,
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
      isColourlessOnly: produced.length === 0,
      isBasicLand: true,
      isRainbow: false,
      availableFromTurn: 1,
      baseWeight: 1.0,
    };
  }

  // ── Regular lands (non-basic, non-fetch)
  if (isLand(card)) {
    const { isTapped, condition, description } = detectUntapCondition(card);
    const produced = extractProducedColours(card);
    const subtypes = extractLandSubtypes(card);

    let sourceType: SourceType = "untappedLand";
    if (condition === "bounce") sourceType = "bounceLand";
    else if (condition === "alwaysTapped") sourceType = "tapland";
    else if (condition !== "none") sourceType = "conditionalUntap";

    return {
      cardName: name,
      sourceType,
      producedColours: produced,
      typedLandSubtypes: subtypes,
      isTappedOnEntry: isTapped,
      untapCondition: condition,
      untapConditionDescription: description,
      activationCostGeneric: 0,
      isOpponentDependent: false,
      requiresSummoningTurn: false,
      isFetchland: false,
      fetchTargetSubtypes: [],
      isMDFC: false,
      mdFCLandSideEntersTapped: false,
      isColourlessOnly: produced.length === 0,
      isBasicLand: false,
      isRainbow: false,
      availableFromTurn: isTapped ? 2 : 1,
      baseWeight: 1.0,
    };
  }

  // ── Turn-two/three ramp spells
  if (
    isInstantOrSorcery(card) ||
    (typeLine(card).includes("enchantment") && t.includes("search your library"))
  ) {
    if (TURN_THREE_RAMP_SPELLS.has(name)) {
      const produced = extractProducedColours(card);
      return {
        cardName: name,
        sourceType: "turnThreeRamp",
        producedColours: produced.length > 0 ? produced : ["W", "U", "B", "R", "G"],
        typedLandSubtypes: [],
        isTappedOnEntry: false,
        untapCondition: "none",
        untapConditionDescription: "Puts a land from library into play tapped",
        activationCostGeneric: 0,
        isOpponentDependent: false,
        requiresSummoningTurn: false,
        isFetchland: false,
        fetchTargetSubtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"],
        isMDFC: false,
        mdFCLandSideEntersTapped: false,
        isColourlessOnly: false,
        isBasicLand: false,
        isRainbow: false,
        availableFromTurn: 4,
        baseWeight: 0.9,
      };
    }
    if (TURN_TWO_RAMP_SPELLS.has(name)) {
      const subtypes: string[] = [];
      for (const s of BASIC_LAND_SUBTYPES) {
        if (t.includes(s.toLowerCase())) subtypes.push(s);
      }
      const produced = subtypes
        .map((s) => BASIC_SUBTYPE_TO_COLOUR[s])
        .filter(Boolean) as MtgColour[];
      return {
        cardName: name,
        sourceType: "turnTwoRamp",
        producedColours: produced.length > 0 ? produced : ["G"],
        typedLandSubtypes: subtypes,
        isTappedOnEntry: false,
        untapCondition: "none",
        untapConditionDescription: "Puts a land from library into play",
        activationCostGeneric: 0,
        isOpponentDependent: false,
        requiresSummoningTurn: false,
        isFetchland: false,
        fetchTargetSubtypes: subtypes.length > 0 ? subtypes : ["Forest"],
        isMDFC: false,
        mdFCLandSideEntersTapped: false,
        isColourlessOnly: false,
        isBasicLand: false,
        isRainbow: false,
        availableFromTurn: 3,
        baseWeight: 0.9,
      };
    }
  }

  // ── Two-mana rocks (Signets, Talismans, Arcane Signet)
  if (isArtifact(card) && !isLand(card)) {
    const produced = extractProducedColours(card);
    const isColourless = produced.length === 0;

    // Mana value determines type
    const mv = card.cmc ?? 0;

    if (mv === 2 && (produced.length > 0 || t.includes("add"))) {
      // Signet pattern: needs {1} to activate
      const needsActivation = t.includes("{1},") || t.includes("{1}: add");
      return {
        cardName: name,
        sourceType: "twoManaRock",
        producedColours: produced,
        typedLandSubtypes: [],
        isTappedOnEntry: false,
        untapCondition: "none",
        untapConditionDescription: "",
        activationCostGeneric: needsActivation ? 1 : 0,
        isOpponentDependent: false,
        requiresSummoningTurn: false,
        isFetchland: false,
        fetchTargetSubtypes: [],
        isMDFC: false,
        mdFCLandSideEntersTapped: false,
        isColourlessOnly: isColourless,
        isBasicLand: false,
        isRainbow: false,
        availableFromTurn: 3,
        baseWeight: 0.75,
      };
    }

    // Other mana rocks (colourless acceleration, Commander's Sphere, etc.)
    if (t.includes("{t}: add") || t.includes("add {")) {
      return {
        cardName: name,
        sourceType: isColourless ? "manaRock" : "twoManaRock",
        producedColours: produced,
        typedLandSubtypes: [],
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
        isColourlessOnly: isColourless,
        isBasicLand: false,
        isRainbow: false,
        availableFromTurn: mv <= 2 ? 3 : mv + 1,
        baseWeight: isColourless ? 0 : 0.75,
      };
    }

    return null;
  }

  // ── Mana dorks (creatures that tap for mana)
  if (isCreature(card) && t.includes("{t}: add")) {
    const produced = extractProducedColours(card);
    const isColourless = produced.length === 0;
    const hasHaste = t.includes("haste");
    return {
      cardName: name,
      sourceType: "manaDork",
      producedColours: produced,
      typedLandSubtypes: [],
      isTappedOnEntry: false,
      untapCondition: "none",
      untapConditionDescription: "",
      activationCostGeneric: 0,
      isOpponentDependent: false,
      requiresSummoningTurn: !hasHaste,
      isFetchland: false,
      fetchTargetSubtypes: [],
      isMDFC: false,
      mdFCLandSideEntersTapped: false,
      isColourlessOnly: isColourless,
      isBasicLand: false,
      isRainbow: false,
      availableFromTurn: hasHaste ? 1 : 2,
      baseWeight: 0.75,
    };
  }

  return null;
}
