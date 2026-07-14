import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ManaSourceProfile } from "../../domain/types";
import { useCardDataStore } from "../cardData";
import { useDeckStore } from "../deck";
import { isWorkerMessage, useAnalysisStore } from "../analysis";
import { isSafeWorkerMessage } from "../../security/simulation";

describe("worker message validation", () => {
  it("ignores unknown worker message types", () => {
    expect(isWorkerMessage({ type: "unknown", payload: {} })).toBe(false);
  });

  it("accepts valid progress and error messages", () => {
    expect(isWorkerMessage({ type: "progress", payload: { progress: 0.5 } })).toBe(true);
    expect(isWorkerMessage({ type: "error", payload: { message: "failed" } })).toBe(true);
  });

  it("rejects malformed result messages", () => {
    expect(isWorkerMessage({ type: "result", payload: { probabilities: null } })).toBe(false);
    expect(
      isWorkerMessage({
        type: "result",
        payload: { probabilities: { a: 0.9 }, iterations: 100, durationMs: 5 },
      }),
    ).toBe(true);
    expect(isWorkerMessage({ type: "progress", payload: { progress: 2 } })).toBe(false);
    expect(
      isWorkerMessage({
        type: "result",
        payload: { probabilities: { a: 1.1 }, iterations: 100, durationMs: 5 },
      }),
    ).toBe(false);
    expect(
      isSafeWorkerMessage(
        {
          type: "result",
          payload: { probabilities: { unexpected: 0.9 }, iterations: 100, durationMs: 5 },
        },
        new Set(["expected"]),
      ),
    ).toBe(false);
  });
});

describe("all-card analysis rows", () => {
  function whiteSource(): ManaSourceProfile {
    return {
      cardName: "Plains",
      sourceType: "basic",
      producedColours: ["W"],
      typedLandSubtypes: ["Plains"],
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
    };
  }

  it("scores coloured nonlands and skips cards with no coloured pips", () => {
    setActivePinia(createPinia());
    const deckStore = useDeckStore();
    const cardDataStore = useCardDataStore();
    const analysisStore = useAnalysisStore();

    deckStore.setCards([
      {
        name: "Test Commander",
        typeLine: "Legendary Creature",
        manaCost: "{W}",
        colourIdentity: ["W"],
        cmc: 1,
        quantity: 1,
        isCommander: true,
      },
      {
        name: "Plains",
        typeLine: "Basic Land — Plains",
        colourIdentity: [],
        cmc: 0,
        quantity: 9,
      },
      {
        name: "White Spell",
        typeLine: "Creature",
        manaCost: "{1}{W}",
        colourIdentity: ["W"],
        cmc: 2,
        quantity: 1,
      },
      {
        name: "Sol Ring",
        typeLine: "Artifact",
        manaCost: "{1}",
        colourIdentity: [],
        cmc: 1,
        quantity: 1,
      },
    ]);
    deckStore.setCommanderInfo({
      names: ["Test Commander"],
      colourIdentity: ["W"],
      count: 1,
      librarySize: 99,
    });
    cardDataStore.sourceProfiles.set("Plains", { ...whiteSource(), cardName: "Plains" });
    analysisStore.setTargets([
      {
        id: "white-spell",
        cardName: "White Spell",
        targetTurn: 2,
        requiredPips: { W: 1 },
        totalManaValue: 2,
        probabilityThreshold: 0.9,
        priorityTier: "must",
        isAutoDetected: true,
      },
    ]);
    analysisStore.runKarsten();

    expect(analysisStore.allCardRows.map((row) => row.card.name)).toEqual([
      "White Spell",
      "Sol Ring",
    ]);
    expect(analysisStore.allCardRows.find((row) => row.card.name === "White Spell")?.karstenResult).toBeTruthy();
    expect(analysisStore.allCardRows.find((row) => row.card.name === "Sol Ring")?.karstenResult).toBeNull();
  });
});

describe("simulation availability limits", () => {
  it("terminates a worker that exceeds the timeout", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn<() => void>();
    class HangingWorker {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage() {}
      terminate = terminate;
    }
    vi.stubGlobal("Worker", HangingWorker);
    setActivePinia(createPinia());
    const deckStore = useDeckStore();
    const analysisStore = useAnalysisStore();
    deckStore.setCards([
      {
        name: "Test Spell",
        typeLine: "Sorcery",
        manaCost: "{W}",
        colourIdentity: ["W"],
        cmc: 1,
        quantity: 1,
      },
    ]);
    deckStore.setCommanderInfo({
      names: ["Test Commander"],
      colourIdentity: ["W"],
      count: 1,
      librarySize: 99,
    });
    analysisStore.setTargets([
      {
        id: "test-spell",
        cardName: "Test Spell",
        targetTurn: 1,
        requiredPips: { W: 1 },
        totalManaValue: 1,
        probabilityThreshold: 0.9,
        priorityTier: "must",
        isAutoDetected: false,
      },
    ]);

    let simulationError: unknown;
    const simulation = analysisStore.runSimulation().catch((error: unknown) => {
      simulationError = error;
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await simulation;
    expect(simulationError).toBeInstanceOf(Error);
    expect((simulationError as Error).message).toContain("60 second safety limit");
    expect(terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
