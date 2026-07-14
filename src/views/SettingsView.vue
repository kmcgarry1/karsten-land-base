<script setup lang="ts">
import { useSettingsStore } from "../stores/settings";
import type { MtgColour } from "../domain/types";
import { ALL_COLOURS } from "../domain/types";
import { useI18n } from "vue-i18n";
import { clearApplicationDataAndReload } from "../security/storage";

const settingsStore = useSettingsStore();
const settings = settingsStore.settings;
const { t } = useI18n();

function togglePodColour(colour: MtgColour) {
  const current = settings.knownPodColours;
  if (current.includes(colour)) {
    settingsStore.setKnownPodColours(current.filter((c) => c !== colour));
  } else {
    settingsStore.setKnownPodColours([...current, colour]);
  }
}

function setThresholdFromEvent(e: Event) {
  settingsStore.setThreshold(Number((e.target as HTMLInputElement).value));
}

function setIterationsFromEvent(e: Event) {
  settingsStore.setSimulationIterations(Number((e.target as HTMLSelectElement).value));
}

function clearLocalData() {
  if (!window.confirm(t("settings.privacy.confirm"))) return;
  clearApplicationDataAndReload();
}
</script>

<template>
  <div class="page-container">
    <section class="card card-tonal card-pad mb-6">
      <h1 class="page-title">{{ t("settings.title") }}</h1>
    </section>

    <div class="settings-grid">
      <section class="card card-pad">
          <h2 class="section-title">{{ t("modes.label") }}</h2>
          <div class="mt-5 flex flex-col gap-5">
            <div class="segmented">
              <button
                type="button"
                class="segment"
                :class="{ active: settings.mode === 'karsten' }"
                @click="settingsStore.setMode('karsten')"
              >
                {{ t("modes.karsten") }}
              </button>
              <button
                type="button"
                class="segment"
                :class="{ active: settings.mode === 'exact' }"
                @click="settingsStore.setMode('exact')"
              >
                {{ t("modes.exact") }}
              </button>
            </div>
          </div>
      </section>

      <section class="card card-pad">
          <h2 class="section-title">{{ t("settings.threshold") }}</h2>
          <div class="mt-5 flex flex-col gap-5">
            <input
              class="range"
              type="range"
              :value="settings.targetThreshold"
              min="0.5"
              max="0.99"
              step="0.01"
              @input="setThresholdFromEvent"
            />
            <span class="text-sm font-bold text-[var(--text)]">
              {{ Math.round(settings.targetThreshold * 100) }}%
            </span>
          </div>
      </section>

      <section class="card card-pad">
          <h2 class="section-title">{{ t("settings.toggles") }}</h2>
          <div class="mt-5 flex flex-col gap-3">
            <label class="switch-row">
              <input v-model="settings.countTaplandsTurnTwo" class="peer sr-only" type="checkbox" />
              <span class="switch" />
              <span>{{ t("settings.countTaplands") }}</span>
            </label>
            <label class="switch-row">
              <input v-model="settings.countMDFCsAsLands" class="peer sr-only" type="checkbox" />
              <span class="switch" />
              <span>{{ t("settings.countMdfcs") }}</span>
            </label>
            <label class="switch-row">
              <input v-model="settings.countOrchardAsThreeQuarter" class="peer sr-only" type="checkbox" />
              <span class="switch" />
              <span>{{ t("settings.orchard") }}</span>
            </label>
            <label class="switch-row">
              <input v-model="settings.countFellwarAsHalf" class="peer sr-only" type="checkbox" />
              <span class="switch" />
              <span>{{ t("settings.fellwar") }}</span>
            </label>
          </div>
      </section>

      <section class="card card-pad">
          <h2 class="section-title">{{ t("settings.podColours") }}</h2>
          <div class="mt-5 flex flex-col gap-4">
            <div class="colour-choice-list">
              <button
                v-for="colour in ALL_COLOURS"
                :key="colour"
                type="button"
                :class="[
                  'colour-choice',
                  `colour-${colour.toLowerCase()}`,
                  settings.knownPodColours.includes(colour) ? 'is-selected' : '',
                ]"
                :aria-pressed="settings.knownPodColours.includes(colour)"
                @click="togglePodColour(colour)"
              >
                {{ colour }} · {{ t(`settings.colours.${colour}`) }}
              </button>
            </div>
          </div>
      </section>

      <section v-if="settings.mode === 'exact'" class="card card-pad">
          <h2 class="section-title">{{ t("settings.iterations") }}</h2>
          <div class="mt-5 flex flex-col gap-3">
            <select class="field" :value="settings.simulationIterations" @change="setIterationsFromEvent">
              <option :value="10000">{{ t("settings.veryFast") }}</option>
              <option :value="50000">{{ t("settings.recommended") }}</option>
              <option :value="100000">{{ t("settings.accurate") }}</option>
              <option :value="200000">{{ t("settings.veryAccurate") }}</option>
            </select>
          </div>
      </section>

      <section class="card card-pad">
          <h2 class="section-title">{{ t("settings.reset") }}</h2>
          <div class="mt-5 flex flex-col items-start gap-4">
            <button type="button" class="btn btn-tonal" @click="settingsStore.resetToDefaults()">
              {{ t("settings.resetButton") }}
            </button>
          </div>
      </section>

      <section class="card card-pad">
          <h2 class="section-title">{{ t("settings.privacy.title") }}</h2>
          <div class="mt-5 flex flex-col items-start gap-4">
            <p class="privacy-copy">{{ t("settings.privacy.disclosure") }}</p>
            <button type="button" class="btn btn-tonal" @click="clearLocalData">
              {{ t("settings.privacy.clear") }}
            </button>
          </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  border: 1px solid var(--border);
  background: var(--border);
}

.settings-grid > .card {
  min-height: 230px;
  border: 0;
  border-radius: 0;
}

.section-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.privacy-copy {
  max-width: 58ch;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
.segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: transparent;
  padding: 0;
}

.segment {
  border-left: 1px solid var(--border);
  border-radius: 0;
  padding: 10px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.segment.active {
  background: var(--surface-2);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--accent);
}

.segment:first-child {
  border-left: 0;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.range {
  width: 100%;
  accent-color: var(--accent);
}

.colour-choice-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.colour-choice {
  border: 1px solid transparent;
  border-radius: 2px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
}

.colour-w {
  background: rgba(178, 180, 194, 0.24);
}
.colour-u {
  background: rgba(14, 104, 171, 0.2);
}
.colour-b {
  background: rgba(54, 47, 67, 0.42);
}
.colour-r {
  background: rgba(211, 32, 42, 0.2);
}
.colour-g {
  background: rgba(0, 115, 62, 0.2);
}

.is-selected {
  border-color: var(--accent);
}

@media (max-width: 860px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
