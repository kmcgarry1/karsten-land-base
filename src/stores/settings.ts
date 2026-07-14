import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { AnalysisSettings, MtgColour } from "../domain/types";
import { DEFAULT_ANALYSIS_SETTINGS } from "../domain/constants";
import { APP_STORAGE_KEYS, removeStorageKey } from "../security/storage";
import { isPlainRecord, validateAnalysisSettings } from "../security/validation";

const SETTINGS_STORAGE_KEY = APP_STORAGE_KEYS.settings;

function loadPersistedSettings(): AnalysisSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ANALYSIS_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      removeStorageKey(SETTINGS_STORAGE_KEY);
      return { ...DEFAULT_ANALYSIS_SETTINGS };
    }
    return validateSettings(parsed);
  } catch {
    removeStorageKey(SETTINGS_STORAGE_KEY);
    return { ...DEFAULT_ANALYSIS_SETTINGS };
  }
}

export function validateSettings(value: unknown): AnalysisSettings {
  return validateAnalysisSettings(value);
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AnalysisSettings>(loadPersistedSettings());

  // Persist on change
  watch(
    settings,
    (val) => {
      try {
        const persisted: Partial<AnalysisSettings> = { ...val };
        delete persisted.simulationRunning;
        delete persisted.simulationProgress;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persisted));
      } catch {}
    },
    { deep: true },
  );

  function setMode(mode: "karsten" | "exact") {
    settings.value.mode = mode;
  }

  function setThreshold(threshold: number) {
    settings.value.targetThreshold = Math.min(1, Math.max(0.5, threshold));
  }

  function setSimulationIterations(n: number) {
    settings.value.simulationIterations = Math.min(200000, Math.max(1000, n));
  }

  function setKnownPodColours(colours: MtgColour[]) {
    settings.value.knownPodColours = colours;
  }

  function toggleMDFCsAsLands(val: boolean) {
    settings.value.countMDFCsAsLands = val;
  }

  function toggleTaplandsTurnTwo(val: boolean) {
    settings.value.countTaplandsTurnTwo = val;
  }

  function toggleFellwarAsHalf(val: boolean) {
    settings.value.countFellwarAsHalf = val;
  }

  function toggleOrchardAsThreeQuarter(val: boolean) {
    settings.value.countOrchardAsThreeQuarter = val;
  }

  function resetToDefaults() {
    settings.value = { ...DEFAULT_ANALYSIS_SETTINGS };
  }

  function applySettings(next: AnalysisSettings) {
    settings.value = validateSettings(next);
  }

  return {
    settings,
    setMode,
    setThreshold,
    setSimulationIterations,
    setKnownPodColours,
    toggleMDFCsAsLands,
    toggleTaplandsTurnTwo,
    toggleFellwarAsHalf,
    toggleOrchardAsThreeQuarter,
    resetToDefaults,
    applySettings,
  };
});
