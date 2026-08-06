import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouter, createWebHashHistory } from "vue-router";
import { i18n, setLocale } from "../../i18n";
import AnalysisView from "../AnalysisView.vue";
import AnalysisCardsView from "../AnalysisCardsView.vue";
import { useAnalysisStore } from "../../stores/analysis";
import { useDeckStore } from "../../stores/deck";

function storageMock(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

function seedStores() {
  const deckStore = useDeckStore();
  const analysisStore = useAnalysisStore();

  deckStore.deckName = "Blue Tempo";
  deckStore.setCommanderInfo({
    names: ["Talrand, Sky Summoner"],
    colourIdentity: ["U"],
    count: 1,
    librarySize: 99,
  });

  analysisStore.setTargets([
    {
      id: "spell-1",
      cardName: "Counterspell",
      targetTurn: 2,
      requiredPips: { U: 2 },
      totalManaValue: 2,
      probabilityThreshold: 0.9,
      priorityTier: "must",
      isAutoDetected: false,
    },
  ]);

  analysisStore.report = {
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
        target: analysisStore.targets[0]!,
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
  };
}

function shareDialogStub() {
  return {
    name: "ShareLinkDialog",
    props: ["open"],
    template:
      '<div data-test="share-dialog" :data-open="String(open)"><button data-test="close-share" @click="$emit(\'close\')">close</button></div>',
  };
}

async function createTestRouter() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: "/", component: AnalysisView },
      { path: "/analysis", component: AnalysisView },
      { path: "/analysis/cards", component: AnalysisCardsView },
    ],
  });
  await router.push("/analysis");
  await router.isReady();
  return router;
}

async function mountAnalysisView() {
  const router = await createTestRouter();
  return mount(AnalysisView, {
    global: {
      plugins: [i18n, router],
      stubs: {
        RouterLink: true,
        ShareLinkDialog: shareDialogStub(),
        ModeToggle: true,
        ColourIdentityBadge: true,
        SourceBreakdownTable: true,
        KeySpellEditor: true,
        RecommendationPanel: true,
        AssumptionWarnings: true,
      },
    },
  });
}

async function mountAnalysisCardsView() {
  const router = await createTestRouter();
  await router.push("/analysis/cards");
  await router.isReady();
  return mount(AnalysisCardsView, {
    global: {
      plugins: [i18n, router],
      stubs: {
        RouterLink: true,
        ShareLinkDialog: shareDialogStub(),
        ColourIdentityBadge: true,
      },
    },
  });
}

describe("Analysis share actions", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storageMock());
    setLocale("en");
    setActivePinia(createPinia());
    seedStores();
  });

  it("opens and closes the share dialog from AnalysisView", async () => {
    const wrapper = await mountAnalysisView();

    expect(wrapper.get('[data-test="share-dialog"]').attributes("data-open")).toBe("false");

    const shareButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Share"));
    expect(shareButton).toBeTruthy();
    await shareButton!.trigger("click");

    expect(wrapper.get('[data-test="share-dialog"]').attributes("data-open")).toBe("true");

    await wrapper.get('[data-test="close-share"]').trigger("click");
    expect(wrapper.get('[data-test="share-dialog"]').attributes("data-open")).toBe("false");
  });

  it("opens and closes the share dialog from AnalysisCardsView", async () => {
    const wrapper = await mountAnalysisCardsView();

    expect(wrapper.get('[data-test="share-dialog"]').attributes("data-open")).toBe("false");

    const shareButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Share"));
    expect(shareButton).toBeTruthy();
    await shareButton!.trigger("click");

    expect(wrapper.get('[data-test="share-dialog"]').attributes("data-open")).toBe("true");

    await wrapper.get('[data-test="close-share"]').trigger("click");
    expect(wrapper.get('[data-test="share-dialog"]').attributes("data-open")).toBe("false");
  });
});
