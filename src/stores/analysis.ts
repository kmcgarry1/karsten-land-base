import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  SpellTarget,
  AnalysisReport,
  CardRecord,
  WorkerMessage,
  SimulationInput,
  SimulationOutput,
  CardAnalysisRow,
  SpellAnalysisResult,
} from "../domain/types";
import { explainSourcesForTarget, runKarstenAnalysis } from "../engines/karsten";
import { cardToSpellTarget } from "../engines/karsten";
import { useCardDataStore } from "./cardData";
import { useDeckStore } from "./deck";
import { useSettingsStore } from "./settings";
import { SECURITY_LIMITS, simulationLimitError } from "../security/limits";
import { isSafeSimulationInput, isSafeWorkerMessage } from "../security/simulation";
import { SecurityServiceError } from "../security/errors";

export const useAnalysisStore = defineStore("analysis", () => {
  const targets = ref<SpellTarget[]>([]);
  const report = ref<AnalysisReport | null>(null);
  const isAnalysing = ref(false);
  const simulationProgress = ref(0);
  const simulationWorker = ref<Worker | null>(null);
  const analysisError = ref("");
  const cardExactProgress = ref(0);
  const cardExactRunning = ref(false);
  const cardExactError = ref("");
  const cardExactProbabilities = ref<Record<string, number>>({});
  const cardExactSignature = ref("");
  let simulationTimer: ReturnType<typeof setTimeout> | null = null;
  let simulationReject: ((reason: Error) => void) | null = null;

  const cardDataStore = useCardDataStore();
  const deckStore = useDeckStore();
  const settingsStore = useSettingsStore();

  const hasReport = computed(() => report.value !== null);

  const failingTargets = computed(
    () => report.value?.spellResults.filter((r) => r.status === "fail") ?? [],
  );

  const passingTargets = computed(
    () => report.value?.spellResults.filter((r) => r.status === "pass") ?? [],
  );

  const overallHealth = computed(() => {
    if (!report.value) return null;
    const failing = failingTargets.value.length;
    const total = report.value.spellResults.length;
    if (total === 0) return "pass";
    if (failing === 0) return "pass";
    if (failing / total > 0.5) return "fail";
    return "warn";
  });

  const cardAnalysisSignature = computed(() =>
    JSON.stringify({
      commander: deckStore.commanderInfo,
      cards: deckStore.cards.map((card) => ({
        name: card.name,
        quantity: card.quantity,
        typeLine: card.typeLine,
        manaCost: card.manaCost,
        cmc: card.cmc,
        isCommander: card.isCommander,
      })),
      settings: settingsStore.settings,
      profiles: Object.keys(cardDataStore.profilesWithQuantity).sort(),
    }),
  );

  const allCardRows = computed<CardAnalysisRow[]>(() => {
    const commander = deckStore.commanderInfo;
    if (!report.value || !commander) return [];
    const deckCards = deckStore.cards.filter((card) => !card.isCommander);
    const cards = deckCards.filter((card) => !isLandCard(card));
    const targets = cards
      .map((card) => cardToCardViewTarget(card))
      .filter((target): target is NonNullable<typeof target> => !!target);
    for (const target of targets) {
      target.probabilityThreshold = settingsStore.settings.targetThreshold;
    }
    const allCardReport = runKarstenAnalysis({
      deck: deckCards,
      commander,
      targets,
      settings: settingsStore.settings,
      sourceProfiles: cardDataStore.profilesWithQuantity,
    });

    return cards.map((card) => {
      const target = targets.find((target) => target.id === cardViewTargetId(card)) ?? null;
      const karstenResult = target
        ? allCardReport.spellResults.find((result) => result.target.id === target.id) ?? null
        : null;
      const selectedResult = findResultForCard(card, report.value?.spellResults ?? []);
      const exactFromCardRun =
        cardExactSignature.value === cardAnalysisSignature.value && target
          ? cardExactProbabilities.value[target.id]
          : undefined;
      const exactProbability =
        typeof exactFromCardRun === "number"
          ? exactFromCardRun
          : selectedResult?.exactProbability ?? null;

      return {
        id: cardViewTargetId(card),
        card,
        target,
        karstenResult,
        exactProbability,
        sourceBreakdown:
          target && karstenResult
            ? explainSourcesForTarget({
                target,
                commander,
                settings: settingsStore.settings,
                sourceProfiles: cardDataStore.profilesWithQuantity,
              })
            : null,
        image: fullCardImage(card),
        isSelectedTarget: !!selectedResult,
      };
    });
  });

  /** Auto-detect key spells from the deck (highest MV, commanders, etc.) */
  function autoDetectTargets(deck: CardRecord[]): SpellTarget[] {
    const commanders = deck.filter((c) => c.isCommander);
    const nonLand = deck.filter((c) => !c.isCommander && !isLandCard(c));

    const detected: SpellTarget[] = [];

    // Always add commanders as targets
    for (const cmd of commanders) {
      const target = cardToSpellTarget(cmd);
      if (Object.keys(target.requiredPips).length > 0) {
        detected.push({ ...target, priorityTier: "must" });
      }
    }

    // Add any non-land spell with complex pip requirements (2+ pips in one colour)
    const pressureSpells = nonLand
      .filter((c) => {
        const pips = cardToSpellTarget(c).requiredPips;
        return Object.values(pips).some((p) => (p ?? 0) >= 2);
      })
      .sort((a, b) => b.cmc - a.cmc)
      .slice(0, 5);

    for (const card of pressureSpells) {
      const existing = detected.find((t) => t.cardName === card.name);
      if (!existing) detected.push(cardToSpellTarget(card, "nice"));
    }

    return detected;
  }

  function setTargets(newTargets: SpellTarget[]) {
    targets.value = newTargets;
  }

  function addTarget(target: SpellTarget) {
    targets.value.push(target);
  }

  function removeTarget(id: string) {
    targets.value = targets.value.filter((t) => t.id !== id);
  }

  function updateTarget(id: string, patch: Partial<SpellTarget>) {
    const idx = targets.value.findIndex((t) => t.id === id);
    if (idx >= 0) targets.value[idx] = { ...targets.value[idx]!, ...patch } as SpellTarget;
  }

  /** Run Karsten heuristic analysis (synchronous). */
  function runKarsten() {
    const commander = deckStore.commanderInfo;
    if (!commander) return;

    const deckCards = deckStore.cards.filter((c) => !c.isCommander);
    const settings = settingsStore.settings;

    report.value = runKarstenAnalysis({
      deck: deckCards,
      commander,
      targets: targets.value,
      settings,
      sourceProfiles: cardDataStore.profilesWithQuantity,
    });
  }

  /** Run Monte Carlo simulation (Web Worker, async). */
  async function runSimulation(): Promise<void> {
    const commander = deckStore.commanderInfo;
    if (!commander) throw new Error("No commander info");
    simulationProgress.value = 0;
    isAnalysing.value = true;
    const input: SimulationInput = {
      deck: deckStore.cards.filter((card) => !card.isCommander),
      commander,
      targets: targets.value,
      settings: settingsStore.settings,
      sourceProfiles: cardDataStore.profilesWithQuantity,
      iterations: settingsStore.settings.simulationIterations,
    };
    const output = await executeSimulation(input, (progress) => {
      simulationProgress.value = progress;
    });
    if (report.value) {
      for (const result of report.value.spellResults) {
        const probability = output.probabilities[result.target.id];
        if (probability !== undefined) {
          result.exactProbability = probability;
          result.status = probability >= result.target.probabilityThreshold ? "pass" : "fail";
        }
      }
      report.value = { ...report.value, mode: "exact", timestamp: Date.now() };
    }
    simulationProgress.value = 1;
    isAnalysing.value = false;
  }

  async function runExactForCardRows(rowIds: string[]): Promise<void> {
    const commander = deckStore.commanderInfo;
    if (!commander) throw new Error("No commander info");
    const rows = allCardRows.value.filter((row) => row.target && rowIds.includes(row.id));
    if (rows.length === 0) {
      cardExactProbabilities.value = {};
      cardExactProgress.value = 1;
      return;
    }
    cardExactRunning.value = true;
    cardExactProgress.value = 0;
    cardExactError.value = "";
    const input: SimulationInput = {
      deck: deckStore.cards.filter((card) => !card.isCommander),
      commander,
      targets: rows.map((row) => row.target!),
      settings: settingsStore.settings,
      sourceProfiles: cardDataStore.profilesWithQuantity,
      iterations: settingsStore.settings.simulationIterations,
    };
    try {
      const output = await executeSimulation(input, (progress) => {
        cardExactProgress.value = progress;
      });
      cardExactProbabilities.value = output.probabilities;
      cardExactSignature.value = cardAnalysisSignature.value;
      cardExactProgress.value = 1;
    } catch (error) {
      cardExactError.value = error instanceof Error ? error.message : "Card exact simulation failed";
      throw error;
    } finally {
      cardExactRunning.value = false;
    }
  }

  function executeSimulation(
    input: SimulationInput,
    onProgress: (progress: number) => void,
  ): Promise<SimulationOutput> {
    const limitError = simulationLimitError(input.iterations, input.targets.length);
    if (limitError || !isSafeSimulationInput(input)) {
      return Promise.reject(
        new SecurityServiceError(
          "resource-limit",
          limitError ?? "Simulation input failed validation.",
        ),
      );
    }
    cancelSimulation("Simulation replaced by a newer request.");
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("../engines/simulation.worker.ts", import.meta.url), {
        type: "module",
      });
      simulationWorker.value = worker;
      simulationReject = reject;
      const expectedIds = new Set(input.targets.map((target) => target.id));

      const cleanup = () => {
        if (simulationTimer) clearTimeout(simulationTimer);
        simulationTimer = null;
        simulationReject = null;
        worker.terminate();
        if (simulationWorker.value === worker) simulationWorker.value = null;
      };
      const fail = (message: string) => {
        cleanup();
        reject(new Error(message));
      };

      simulationTimer = setTimeout(
        () => {
          cleanup();
          reject(new SecurityServiceError("timeout", "Simulation exceeded the 60 second safety limit."));
        },
        SECURITY_LIMITS.simulationTimeoutMs,
      );
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data;
        if (!isSafeWorkerMessage(message, expectedIds)) {
          fail("Simulation worker returned an invalid message.");
          return;
        }
        if (message.type === "progress") onProgress(message.payload.progress);
        else if (message.type === "result") {
          cleanup();
          resolve(message.payload);
        } else fail(message.payload.message);
      };
      worker.onerror = (error) => fail(error.message || "Simulation worker failed");
      worker.postMessage(
        JSON.parse(JSON.stringify({ type: "start", payload: input } satisfies WorkerMessage)),
      );
    });
  }

  function cancelSimulation(message = "Simulation cancelled.") {
    const reject = simulationReject;
    simulationReject = null;
    if (simulationTimer) clearTimeout(simulationTimer);
    simulationTimer = null;
    simulationWorker.value?.terminate();
    simulationWorker.value = null;
    isAnalysing.value = false;
    cardExactRunning.value = false;
    reject?.(new Error(message));
  }

  /** Run analysis based on current mode setting. */
  async function analyse() {
    isAnalysing.value = true;
    analysisError.value = "";
    try {
      runKarsten();
      if (settingsStore.settings.mode === "exact") {
        await runSimulation();
      }
    } catch (err) {
      analysisError.value = err instanceof Error ? err.message : "Analysis failed.";
      throw err;
    } finally {
      isAnalysing.value = false;
    }
  }

  function clearReport() {
    report.value = null;
    simulationProgress.value = 0;
    analysisError.value = "";
    cardExactProgress.value = 0;
    cardExactRunning.value = false;
    cardExactError.value = "";
    cardExactProbabilities.value = {};
    cardExactSignature.value = "";
  }

  function clearAll() {
    cancelSimulation();
    targets.value = [];
    clearReport();
  }

  return {
    targets,
    report,
    isAnalysing,
    simulationProgress,
    simulationWorker,
    analysisError,
    cardExactProgress,
    cardExactRunning,
    cardExactError,
    cardExactProbabilities,
    allCardRows,
    hasReport,
    failingTargets,
    passingTargets,
    overallHealth,
    autoDetectTargets,
    setTargets,
    addTarget,
    removeTarget,
    updateTarget,
    runKarsten,
    runSimulation,
    runExactForCardRows,
    cancelSimulation,
    analyse,
    clearReport,
    clearAll,
  };
});

function cardViewTargetId(card: CardRecord): string {
  return `card-view-${card.name}`;
}

function cardToCardViewTarget(card: CardRecord): SpellTarget | null {
  const target = cardToSpellTarget(card, "nice");
  if (Object.keys(target.requiredPips).length === 0) return null;
  return {
    ...target,
    id: cardViewTargetId(card),
    probabilityThreshold: 0.9,
  };
}

function isLandCard(card: CardRecord): boolean {
  if (card.faces?.length) {
    return card.faces.every((face) => face.typeLine.toLowerCase().includes("land"));
  }
  return card.typeLine.toLowerCase().includes("land");
}

function findResultForCard(
  card: CardRecord,
  results: SpellAnalysisResult[],
): SpellAnalysisResult | undefined {
  const normalizedNames = new Set([
    normalizeName(card.name),
    ...(card.faces?.map((face) => normalizeName(face.name)) ?? []),
  ]);
  return results.find((result) => normalizedNames.has(normalizeName(result.target.cardName)));
}

function fullCardImage(card: CardRecord | undefined): string {
  if (!card) return "";
  const faceImage =
    card.faces?.find((face) => face.imageUris?.large)?.imageUris?.large ??
    card.faces?.find((face) => face.imageUris?.normal)?.imageUris?.normal ??
    card.faces?.find((face) => face.imageUris?.artCrop)?.imageUris?.artCrop;

  return (
    card.imageUris?.large ??
    card.imageUris?.normal ??
    faceImage ??
    card.imageUris?.artCrop ??
    ""
  );
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function isWorkerMessage(value: unknown): value is WorkerMessage {
  return isSafeWorkerMessage(value);
}
