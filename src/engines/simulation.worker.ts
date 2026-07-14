/**
 * Monte Carlo simulation worker for exact Commander mana probability.
 *
 * Karsten 2022 mulligan policy:
 *  - Commander free look: draw 7, keep if 3–5 lands, else redraw 7 for free
 *  - London mulligan: keep 7 on 2–5 lands, 6 on 2–4, 5 on 2–4, always keep 4
 *  - Commander gets T1 draw (multiplayer: no skip)
 *  - Condition on having enough total lands
 */

import type {
  WorkerMessage,
  SimulationInput,
  SimulationOutput,
  ManaSourceProfile,
} from "../domain/types";
import { isSafeSimulationInput } from "../security/simulation";

// ─── Utility ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!; a[i] = a[j]!; a[j] = tmp
  }
  return a;
}

function countLands(cards: SimCard[]): number {
  return cards.filter((c) => c.isLand).length;
}

// ─── Simulation card type ─────────────────────────────────────────────────────

interface SimCard {
  name: string;
  isLand: boolean;
  isTappedOnEntry: boolean;
  producedColours: string[]; // MtgColour[] but avoiding type import complexity
  isFetchland: boolean;
  fetchTargetColours: string[];
  isMDFC: boolean;
  mdFCLandSideEntersTapped: boolean;
  availableFromTurn: number;
  activationCostGeneric: number;
  requiresSummoningTurn: boolean;
  isColourlessOnly: boolean;
}

function profileToSimCard(profile: ManaSourceProfile): SimCard {
  return {
    name: profile.cardName,
    isLand: [
      "basic",
      "untappedLand",
      "tapland",
      "conditionalUntap",
      "fetchland",
      "pathway",
      "rainbow",
      "bounceLand",
      "mdfc",
    ].includes(profile.sourceType),
    isTappedOnEntry: profile.isTappedOnEntry,
    producedColours: profile.producedColours,
    isFetchland: profile.isFetchland,
    fetchTargetColours: profile.fetchTargetSubtypes.flatMap((sub) => {
      const m: Record<string, string> = {
        Plains: "W",
        Island: "U",
        Swamp: "B",
        Mountain: "R",
        Forest: "G",
      };
      return m[sub] ? [m[sub]] : [];
    }),
    isMDFC: profile.isMDFC,
    mdFCLandSideEntersTapped: profile.mdFCLandSideEntersTapped,
    availableFromTurn: profile.availableFromTurn,
    activationCostGeneric: profile.activationCostGeneric,
    requiresSummoningTurn: profile.requiresSummoningTurn,
    isColourlessOnly: profile.isColourlessOnly,
  };
}

// ─── Mulligan logic ───────────────────────────────────────────────────────────

function shouldKeep(hand: SimCard[], handSize: number, maxHandSize: number): boolean {
  const lands = countLands(hand.slice(0, maxHandSize));
  if (handSize === 7) return lands >= 2 && lands <= 5;
  if (handSize <= 4) return true;
  return lands >= 2 && lands <= 4;
}

function bottomCards(hand: SimCard[], keepSize: number): SimCard[] {
  // Keep: prefer lands, then non-lands sorted by usefulness
  // Simple heuristic: keep lands first, then rocks, then spells
  const lands = hand.filter((c) => c.isLand);
  const nonLands = hand.filter((c) => !c.isLand);
  const sorted = [...lands, ...nonLands];
  return sorted.slice(0, keepSize);
}

function drawOpeningHand(library: SimCard[]): { hand: SimCard[]; rest: SimCard[] } {
  const hand = library.slice(0, 7);
  const rest = library.slice(7);
  return { hand, rest };
}

/**
 * Simulate the Commander mulligan process.
 * Returns the kept hand (after bottoming) and the remaining library.
 */
function mulliganCommander(initialLibrary: SimCard[]): {
  hand: SimCard[];
  rest: SimCard[];
} {
  // Step 1: Commander free look — draw 7, keep if 3–5 lands
  let lib = shuffle(initialLibrary);
  let { hand, rest } = drawOpeningHand(lib);
  const freeLoopLands = countLands(hand);
  if (freeLoopLands >= 3 && freeLoopLands <= 5) {
    return { hand, rest };
  }

  // Step 2: Regular London mulligan (start at 7 since free look was taken)
  for (let handSize = 7; handSize >= 4; handSize--) {
    lib = shuffle(initialLibrary);
    const drawn = drawOpeningHand(lib);
    hand = drawn.hand;
    rest = drawn.rest;

    if (shouldKeep(hand, handSize, 7)) {
      const kept = bottomCards(hand, handSize);
      // Put bottomed cards back at bottom of rest
      const bottomed = hand.filter((c) => !kept.includes(c));
      return { hand: kept, rest: [...rest, ...bottomed] };
    }
  }

  // Always keep 4-card hand
  lib = shuffle(initialLibrary);
  const fallback = drawOpeningHand(lib);
  const kept = bottomCards(fallback.hand, 4);
  return { hand: kept, rest: [...fallback.rest, ...fallback.hand.slice(4)] };
}

// ─── Casting check ────────────────────────────────────────────────────────────

/**
 * Determine if a spell can be cast given the cards available by a given turn.
 * Models which sources are usable by the target turn:
 *  - Untapped lands in hand: available from T1
 *  - ETB-tapped lands drawn in hand: available from T2
 *  - ETB-tapped lands drawn on turn T: available from T+1
 *  - Dorks played on T1: tap from T2
 *  - Rocks (MV 2) played on T2: tap from T3
 */
function canCastSpell(
  hand: SimCard[],
  drawnByTurn: SimCard[], // all cards seen including hand
  targetTurn: number,
  requiredPips: Record<string, number>,
): boolean {
  // Tally available coloured mana sources by this turn
  const available: Record<string, number> = {};

  for (let i = 0; i < drawnByTurn.length; i++) {
    const card = drawnByTurn[i]
    if (!card) continue
    if (card.isColourlessOnly) continue

    // When was this card drawn? Turn 0 = opening hand, Turn T = drew on turn T
    const drawnOnTurn = i < hand.length ? 0 : i - hand.length + 1;

    let usableOnTurn: number;
    if (card.isTappedOnEntry) {
      usableOnTurn = drawnOnTurn + 1; // ETB tapped: available next turn
    } else if (card.requiresSummoningTurn) {
      usableOnTurn = drawnOnTurn + 1; // Dork: tap next turn
    } else if (card.activationCostGeneric > 0) {
      // Rocks: need 1 extra mana to activate, effectively available 1 turn later
      usableOnTurn = drawnOnTurn + (card.availableFromTurn - 1);
    } else {
      usableOnTurn = drawnOnTurn;
    }

    if (usableOnTurn > targetTurn) continue;

    // Ignore cards that need opponents' colours (simplified: count at 50%)
    const colours = card.isFetchland ? card.fetchTargetColours : card.producedColours;
    for (const c of colours) {
      available[c] = (available[c] ?? 0) + 1;
    }
  }

  // Check if each pip requirement is met
  for (const [colour, pips] of Object.entries(requiredPips)) {
    if ((available[colour] ?? 0) < pips) return false;
  }
  return true;
}

// ─── Simulation loop ──────────────────────────────────────────────────────────

function runSimulation(input: SimulationInput): SimulationOutput {
  const start = performance.now();
  const { targets, sourceProfiles, iterations } = input;

  // Expand deck to individual cards (accounting for quantity)
  const simDeck: SimCard[] = [];
  for (const card of input.deck) {
    const profile = sourceProfiles[card.name];
    if (!profile) {
      // Treat unknown cards as non-sources
      for (let i = 0; i < card.quantity; i++) {
        simDeck.push({
          name: card.name,
          isLand: card.typeLine.toLowerCase().includes("land"),
          isTappedOnEntry: false,
          producedColours: [],
          isFetchland: false,
          fetchTargetColours: [],
          isMDFC: false,
          mdFCLandSideEntersTapped: false,
          availableFromTurn: 1,
          activationCostGeneric: 0,
          requiresSummoningTurn: false,
          isColourlessOnly: true,
        });
      }
      continue;
    }
    const simCard = profileToSimCard(profile);
    for (let i = 0; i < card.quantity; i++) {
      simDeck.push({ ...simCard });
    }
  }

  if (simDeck.length === 0) {
    return { probabilities: {}, iterations: 0, durationMs: 0 };
  }

  // Initialise result counters
  const successes: Record<string, number> = {};
  for (const t of targets) successes[t.id] = 0;
  let validGames = 0;

  const maxTurn = Math.max(...targets.map((t) => t.targetTurn), 1);

  for (let iter = 0; iter < iterations; iter++) {
    // Mulligan
    const { hand, rest } = mulliganCommander(simDeck);

    // Build draw pile: hand + rest drawn over turns
    // Cards in hand: turn 0; draw pile cards drawn on turn T
    const landCountHand = countLands(hand);
    const enoughLands = landCountHand >= 2; // basic sanity check

    if (!enoughLands) continue;
    validGames++;

    // Draw cards up to max target turn
    const drawPile = rest.slice();
    const allSeen = [...hand];
    for (let t = 1; t <= maxTurn; t++) {
      if (drawPile.length > 0) allSeen.push(drawPile.shift()!);
    }

    // Check each target
    for (const target of targets) {
      const seen = allSeen.slice(0, hand.length + target.targetTurn);
      const pipsRecord: Record<string, number> = {};
      for (const [c, n] of Object.entries(target.requiredPips)) {
        if (n) pipsRecord[c] = n;
      }
      if (canCastSpell(hand, seen, target.targetTurn, pipsRecord)) {
        successes[target.id] = (successes[target.id] ?? 0) + 1
      }
    }

    // Report progress every 5000 iterations
    if (iter % 5000 === 0) {
      self.postMessage({
        type: "progress",
        payload: { progress: iter / iterations },
      } satisfies WorkerMessage);
    }
  }

  const probabilities: Record<string, number> = {};
  for (const t of targets) {
    probabilities[t.id] = validGames > 0 ? (successes[t.id] ?? 0) / validGames : 0
  }

  return {
    probabilities,
    iterations: validGames,
    durationMs: performance.now() - start,
  };
}

// ─── Worker message handler ───────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;
  if (!isStartMessage(msg)) return;
  try {
    const result = runSimulation(msg.payload);
    self.postMessage({ type: "result", payload: result } satisfies WorkerMessage);
  } catch (err) {
    self.postMessage({
      type: "error",
      payload: { message: err instanceof Error ? err.message : String(err) },
    } satisfies WorkerMessage);
  }
};

function isStartMessage(value: unknown): value is Extract<WorkerMessage, { type: "start" }> {
  if (!value || typeof value !== "object") return false;
  const msg = value as Partial<WorkerMessage>;
  return msg.type === "start" && isSafeSimulationInput(msg.payload);
}
