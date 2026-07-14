import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../domain/constants";
import { useSettingsStore, validateSettings } from "../settings";

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: vi.fn<(key: string, value: string) => void>(),
  });
  setActivePinia(createPinia());
});

describe("validateSettings", () => {
  it("falls back to defaults for malformed values", () => {
    expect(validateSettings(null)).toEqual(DEFAULT_ANALYSIS_SETTINGS);
    expect(validateSettings({ mode: "bad", targetThreshold: "high" })).toEqual(
      DEFAULT_ANALYSIS_SETTINGS,
    );
  });

  it("clamps and filters persisted settings", () => {
    const settings = validateSettings({
      mode: "exact",
      targetThreshold: 10,
      simulationIterations: 999999,
      knownPodColours: ["U", "bad", "G"],
      countMDFCsAsLands: false,
    });

    expect(settings.mode).toBe("exact");
    expect(settings.targetThreshold).toBe(0.99);
    expect(settings.simulationIterations).toBe(200000);
    expect(settings.knownPodColours).toEqual(["U", "G"]);
    expect(settings.countMDFCsAsLands).toBe(false);
    expect(settings.simulationRunning).toBe(false);
    expect(settings.simulationProgress).toBe(0);
  });

  it("applies a complete settings draft atomically and clears runtime state", () => {
    const store = useSettingsStore();
    store.applySettings({
      ...DEFAULT_ANALYSIS_SETTINGS,
      mode: "exact",
      targetThreshold: 0.95,
      simulationRunning: true,
      simulationProgress: 0.5,
    });

    expect(store.settings.mode).toBe("exact");
    expect(store.settings.targetThreshold).toBe(0.95);
    expect(store.settings.simulationRunning).toBe(false);
    expect(store.settings.simulationProgress).toBe(0);
  });
});
