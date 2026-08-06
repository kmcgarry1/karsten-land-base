import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, setLocale } from "../../../i18n";
import ShareLinkDialog from "../ShareLinkDialog.vue";
import { useAnalysisStore } from "../../../stores/analysis";
import { useDeckStore } from "../../../stores/deck";
import { useSettingsStore } from "../../../stores/settings";

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

function mountDialog() {
  return mount(ShareLinkDialog, {
    props: { open: true },
    global: { plugins: [i18n], stubs: { Teleport: true } },
  });
}

describe("ShareLinkDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storageMock());
    setLocale("en");
    setActivePinia(createPinia());

    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };

    const clipboardWrite = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
    vi.stubGlobal("navigator", { clipboard: { writeText: clipboardWrite } });
    vi.stubGlobal("open", vi.fn());
  });

  it("generates a share URL and copies it", async () => {
    const analysisStore = useAnalysisStore();
    const deckStore = useDeckStore();
    const settingsStore = useSettingsStore();

    deckStore.deckName = "Blue Tempo";
    deckStore.setRawText("1 Talrand, Sky Summoner");
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

    settingsStore.applySettings(settingsStore.settings);

    const wrapper = mountDialog();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const input = wrapper.get("#share-url");
    expect((input.element as HTMLInputElement).value).toContain("#/analysis/shared?share=");

    const copyButton = wrapper.findAll("button").find((button) => button.text() === "Copy link");
    expect(copyButton).toBeTruthy();
    await copyButton!.trigger("click");

    const clipboard = (
      navigator as Navigator & { clipboard: { writeText: ReturnType<typeof vi.fn> } }
    ).clipboard;
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Share link copied.");
  });

  it("shows unavailable state when report data is missing", async () => {
    const wrapper = mountDialog();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Generate a report before sharing.");
  });
});
