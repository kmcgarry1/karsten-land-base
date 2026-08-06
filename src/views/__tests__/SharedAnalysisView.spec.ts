import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouter, createWebHashHistory } from "vue-router";
import { i18n, setLocale } from "../../i18n";
import SharedAnalysisView from "../SharedAnalysisView.vue";
import { createSharedPayload, encodeSharedPayload } from "../../services/sharelink";

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

function buildValidShare(): string {
  const payload = createSharedPayload({
    report: {
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
          target: {
            id: "spell-1",
            cardName: "Counterspell",
            targetTurn: 2,
            requiredPips: { U: 2 },
            totalManaValue: 2,
            probabilityThreshold: 0.9,
            priorityTier: "must",
            isAutoDetected: false,
          },
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
    },
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
    targets: [
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
    ],
    now: Date.now(),
  });

  return encodeSharedPayload(payload);
}

async function mountWithQuery(queryValue: string) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: "/analysis/shared", component: SharedAnalysisView }],
  });
  await router.push({ path: "/analysis/shared", query: { share: queryValue } });
  await router.isReady();

  const wrapper = mount(SharedAnalysisView, {
    global: {
      plugins: [createPinia(), i18n, router],
      stubs: {
        SourceBreakdownTable: true,
        RecommendationPanel: true,
        AssumptionWarnings: true,
        ColourIdentityBadge: true,
      },
    },
  });

  return { wrapper, router };
}

describe("SharedAnalysisView", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storageMock());
    setActivePinia(createPinia());
    setLocale("en");
  });

  it("renders report details for a valid share payload", async () => {
    const { wrapper } = await mountWithQuery(buildValidShare());
    expect(wrapper.text()).toContain("Viewing shared results in read-only mode.");
    expect(wrapper.text()).toContain("Blue Tempo");
    expect(wrapper.text()).toContain("Counterspell");
  });

  it("shows invalid-link error for malformed payload", async () => {
    const { wrapper } = await mountWithQuery("this-is-not-valid");
    expect(wrapper.text()).toContain("This share link is invalid or corrupted.");
  });

  it("shows oversized-link error for too-large payload values", async () => {
    const { wrapper } = await mountWithQuery("x".repeat(12_001));
    expect(wrapper.text()).toContain("This analysis is too large to fit in a shareable link.");
  });

  it("reacts when the share query changes after mount", async () => {
    const { wrapper, router } = await mountWithQuery("bad-share");
    expect(wrapper.text()).toContain("This share link is invalid or corrupted.");

    await router.push({ path: "/analysis/shared", query: { share: buildValidShare() } });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Blue Tempo");
    expect(wrapper.text()).not.toContain("This share link is invalid or corrupted.");
  });
});
