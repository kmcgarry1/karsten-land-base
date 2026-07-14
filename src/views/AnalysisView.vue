<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import ColourIdentityBadge from "../components/shared/ColourIdentityBadge.vue";
import ModeToggle from "../components/shared/ModeToggle.vue";
import SourceBreakdownTable from "../components/analysis/SourceBreakdownTable.vue";
import KeySpellEditor from "../components/analysis/KeySpellEditor.vue";
import RecommendationPanel from "../components/analysis/RecommendationPanel.vue";
import AssumptionWarnings from "../components/analysis/AssumptionWarnings.vue";
import { Zap, Dices, Check, X, Minus, ArrowLeft, Images } from "lucide-vue-next";
import { useDeckStore } from "../stores/deck";
import { useAnalysisStore } from "../stores/analysis";
import { useCardDataStore } from "../stores/cardData";
import { useSettingsStore } from "../stores/settings";
import { explainSourcesForTarget } from "../engines/karsten";
import { COLOUR_CONFIG } from "../domain/constants";
import type { MtgColour, SourceContribution, SourceExplanation, SpellAnalysisResult } from "../domain/types";

const router = useRouter();
const { t } = useI18n();
const deckStore = useDeckStore();
const analysisStore = useAnalysisStore();
const cardDataStore = useCardDataStore();
const settingsStore = useSettingsStore();

const report = computed(() => analysisStore.report);
const commander = computed(() => deckStore.commanderInfo);
const hasParsedDeck = computed(() => (deckStore.parsed?.entries.length ?? 0) > 0);
const cardDataReady = computed(
  () => cardDataStore.resolutionStatus === "ready" || cardDataStore.resolutionStatus === "degraded",
);
const totalTargets = computed(() => report.value?.spellResults.length ?? 0);
const passingTargets = computed(() => totalTargets.value - analysisStore.failingTargets.length);
const expandedTargets = ref<Set<string>>(new Set());

const summaryCards = computed(() => {
  if (!report.value) return [];
  const total = totalTargets.value || 1;
  const passRate = Math.round((passingTargets.value / total) * 100);
  return [
    {
      label: t("analysis.targetsPassing"),
      value: `${passingTargets.value}/${totalTargets.value}`,
      detail: t("analysis.aboveThreshold", { rate: passRate }),
    },
    {
      label: t("analysis.baseComposition"),
      value: t("analysis.landCount", { count: report.value.landCount }),
      detail: t("analysis.taplandCount", { count: report.value.taplandCount }),
    },
    {
      label: t("analysis.analysisMode"),
      value: report.value.mode === "exact" ? t("modes.exactShort") : t("modes.karstenShort"),
      detail: report.value.mode === "exact" ? t("analysis.monteCarlo") : t("analysis.heuristic"),
    },
  ];
});

const mode = computed({
  get: () => settingsStore.settings.mode,
  set: (val) => settingsStore.setMode(val),
});

async function reanalyse() {
  try {
    await analysisStore.analyse();
  } catch {
    // analysisStore.analysisError carries the user-safe message.
  }
}

function abandonAnalysis() {
  const shouldClear = window.confirm(t("analysis.abandonConfirm"));
  if (!shouldClear) return;
  analysisStore.clearAll();
  cardDataStore.clear();
  deckStore.clear();
  router.push("/");
}

onUnmounted(() => {
  analysisStore.cancelSimulation();
});

function getStatusClass(result: SpellAnalysisResult) {
  if (result.status === "pass") return "status-pass";
  if (result.status === "fail") return "status-fail";
  return "status-pending";
}

function formatProb(val: number | null): string {
  if (val === null) return "—";
  return (val * 100).toFixed(1) + "%";
}

function probClass(val: number | null, threshold: number) {
  if (val === null) return "";
  return val >= threshold ? "prob-pass" : "prob-fail";
}

function toggleTargetDetails(id: string) {
  const next = new Set(expandedTargets.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedTargets.value = next;
}

function targetExplanation(result: SpellAnalysisResult): SourceExplanation | null {
  if (!commander.value) return null;
  return explainSourcesForTarget({
    target: result.target,
    commander: commander.value,
    settings: settingsStore.settings,
    sourceProfiles: cardDataStore.profilesWithQuantity,
  });
}

function colourEntries(explanation: SourceExplanation | null) {
  return Object.entries(explanation?.sourceCounts ?? {}) as Array<
    [MtgColour, NonNullable<SourceExplanation["sourceCounts"][MtgColour]>]
  >;
}

function contributionGroups(explanation: SourceExplanation | null): Array<[string, SourceContribution[]]> {
  const groups = explanation?.contributions;
  if (!groups) return [];
  const entries: Array<[string, SourceContribution[]]> = [
    [t("analysis.groups.lands"), groups.lands],
    [t("analysis.groups.fetches"), groups.fetches],
    [t("analysis.groups.conditional"), groups.conditional],
    [t("analysis.groups.rocksRamp"), groups.rocksRamp],
    [t("analysis.groups.opponentDependent"), groups.opponentDependent],
  ];
  return entries.filter((entry) => entry[1].length > 0);
}

async function copyReportSummary() {
  if (!report.value || !commander.value) return;
  const lines = [
    `# ${deckStore.deckName || "Untitled Deck"} Mana Report`,
    "",
    `Commander: ${commander.value.names.join(", ")}`,
    `Mode: ${report.value.mode === "exact" ? "Exact simulation" : "Karsten heuristic"}`,
    `Threshold: ${Math.round(settingsStore.settings.targetThreshold * 100)}%`,
    `Lands: ${report.value.landCount} (${report.value.taplandCount} taplands)`,
    "",
    "## Source Summary",
    ...report.value.overallColourSummary.map(
      (summary) =>
        `- ${COLOUR_CONFIG[summary.colour].name}: ${summary.totalEffective.toFixed(1)} effective / ${summary.neededSources} needed (${summary.deficit > 0 ? `${Math.ceil(summary.deficit)} short` : "pass"})`,
    ),
    "",
    "## Failing Cards",
    ...(analysisStore.failingTargets.length > 0
      ? analysisStore.failingTargets.map(
          (result) =>
            `- ${result.target.cardName}: ${formatProb(result.heuristicProbability)} Karsten${result.exactProbability !== null ? `, ${formatProb(result.exactProbability)} exact` : ""}`,
        )
      : ["- None"]),
    "",
    "## Recommendations",
    ...(report.value.recommendations.length > 0
      ? report.value.recommendations.slice(0, 8).map((rec) => `- ${rec.description}`)
      : ["- No recommendations."]),
  ];

  try {
    await navigator.clipboard?.writeText(lines.join("\n"));
  } catch {
    analysisStore.analysisError = t("analysis.clipboardUnavailable");
  }
}
</script>

<template>
  <div class="page-container analysis-view">
    <section class="card card-tonal card-pad mb-6">
      <div class="analysis-topbar">
        <div class="header-left">
          <button type="button" class="btn btn-tonal" @click="router.push('/')">
            <ArrowLeft :size="16" class="mr-1" />
            {{ t("common.back") }}
          </button>
          <div class="deck-meta">
            <div class="deck-name">{{ deckStore.deckName || t("analysis.untitled") }}</div>
            <div v-if="commander" class="commander-info">
              <span class="cmd-label">{{ commander.count > 1 ? t("common.commanders") : t("common.commander") }}:</span>
              <span class="cmd-names">{{ commander.names.join(", ") }}</span>
              <ColourIdentityBadge :colours="commander.colourIdentity" size="sm" />
              <span class="library-size">{{ t("common.library") }}: {{ commander.librarySize }}</span>
            </div>
          </div>
        </div>

        <div class="header-right">
          <ModeToggle v-model="mode" />
          <router-link :to="{ name: 'analysis-cards' }" class="btn btn-tonal">
            <Images :size="16" />
            {{ t("analysis.cardView") }}
          </router-link>
          <button type="button" class="btn btn-tonal" :disabled="!report" @click="copyReportSummary">
            {{ t("analysis.copySummary") }}
          </button>
          <button type="button" class="btn btn-ghost" @click="abandonAnalysis">
            {{ t("analysis.abandon") }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="analysisStore.isAnalysing"
            @click="reanalyse"
          >
            {{ analysisStore.isAnalysing ? t("analysis.analysing") : t("analysis.reanalyse") }}
          </button>
        </div>
      </div>
    </section>

    <div
      v-if="!report && !analysisStore.isAnalysing && !hasParsedDeck"
      class="alert alert-info mb-4"
    >
      {{ t("analysis.noDeck") }} <router-link class="inline-action" to="/">{{ t("analysis.importDeck") }}</router-link>
      {{ t("analysis.getStarted") }}
    </div>

    <div
      v-else-if="!report && !analysisStore.isAnalysing && hasParsedDeck && !cardDataReady"
      class="alert alert-warning mb-4"
    >
      {{ t("analysis.dataNotReady") }}
      <router-link class="inline-action" to="/">{{ t("analysis.resolveData") }}</router-link>
      {{ t("analysis.continueDegraded") }}
    </div>

    <div v-else-if="!report && !analysisStore.isAnalysing" class="alert alert-info mb-4">
      {{ t("analysis.dataReady") }} <router-link class="inline-action" to="/">{{ t("analysis.runFromImport") }}</router-link>.
    </div>

    <div v-if="analysisStore.analysisError" class="alert alert-error mb-4">
      {{ analysisStore.analysisError }}
    </div>

    <div v-if="report && cardDataStore.isDegraded" class="alert alert-warning mb-4">
      {{ t("analysis.degraded", { count: cardDataStore.unresolvedCount }) }}
    </div>

    <div v-if="analysisStore.isAnalysing && mode === 'exact'" class="card card-pad mb-4">
      <div class="pb-2 text-sm text-[var(--text-muted)]">
        {{ t("analysis.runningSimulation", { progress: Math.round(analysisStore.simulationProgress * 100) }) }}
      </div>
      <div class="progress-track">
        <div
          class="progress-bar"
          :style="{ width: `${analysisStore.simulationProgress * 100}%` }"
        />
      </div>
    </div>

    <template v-if="report">
      <div
        class="alert mb-4"
        :class="
          analysisStore.overallHealth === 'pass'
            ? 'alert-success'
            : analysisStore.overallHealth === 'warn'
              ? 'alert-warning'
              : 'alert-error'
        "
      >
        <div class="flex flex-wrap items-center gap-3">
          <span>
            {{ analysisStore.failingTargets.length }} of {{ report.spellResults.length }} target
            spells below threshold — {{ report.landCount }} lands, {{ report.taplandCount }}
            taplands
          </span>
          <span class="chip">
            <component :is="report.mode === 'exact' ? Dices : Zap" :size="11" class="mr-1" />
            {{ report.mode === "exact" ? t("modes.exactShort") : t("modes.karstenShort") }}
          </span>
        </div>
      </div>

      <div class="summary-grid mb-4">
        <div v-for="card in summaryCards" :key="card.label" class="summary-card">
          <div class="summary-label">{{ card.label }}</div>
          <div class="summary-value">{{ card.value }}</div>
          <div class="summary-detail">{{ card.detail }}</div>
        </div>
      </div>

      <div class="analysis-grid">
        <section class="card card-pad panel-card">
          <div class="panel-heading">
            <div>
              <div class="panel-title">{{ t("analysis.keySpells") }}</div>
              <div class="panel-copy">
                Adjust the curve, goal, or priority to make the most important spells easier to read
                at a glance.
              </div>
            </div>
          </div>
          <div class="mt-6 flex flex-col gap-6">
            <div v-if="report.spellResults.length > 0" class="results-list">
              <div
                v-for="result in report.spellResults"
                :key="result.target.id"
                class="result-row"
                :class="getStatusClass(result)"
              >
                <div class="result-name">
                  <span class="result-card">{{ result.target.cardName }}</span>
                  <span class="result-req"
                    >T{{ result.target.targetTurn }} · MV{{ result.target.totalManaValue }} ·
                    {{ (result.target.probabilityThreshold * 100).toFixed(0) }}% goal</span
                  >
                </div>

                <div class="result-probs">
                  <div class="prob-col">
                    <span class="prob-label">Karsten</span>
                    <span
                      :class="[
                        'prob-val',
                        probClass(result.heuristicProbability, result.target.probabilityThreshold),
                      ]"
                    >
                      {{ formatProb(result.heuristicProbability) }}
                    </span>
                  </div>
                  <div v-if="report.mode === 'exact'" class="prob-col">
                    <span class="prob-label">Exact</span>
                    <span
                      :class="[
                        'prob-val',
                        probClass(result.exactProbability, result.target.probabilityThreshold),
                      ]"
                    >
                      {{ formatProb(result.exactProbability) }}
                    </span>
                  </div>
                </div>

                <span class="result-status-badge" :class="getStatusClass(result)">
                  <Check v-if="result.status === 'pass'" :size="11" />
                  <X v-else-if="result.status === 'fail'" :size="11" />
                  <Minus v-else :size="11" />
                  {{ result.status === "pass" ? t("common.pass") : result.status === "fail" ? t("common.fail") : "…" }}
                </span>
                <button
                  type="button"
                  class="inline-action details-action"
                  @click="toggleTargetDetails(result.target.id)"
                >
                  {{ expandedTargets.has(result.target.id) ? t("analysis.hideDetails") : t("analysis.details") }}
                </button>
                <div v-if="expandedTargets.has(result.target.id)" class="target-details">
                  <div class="target-detail-grid">
                    <div>
                      <div class="panel-subtitle mb-3">{{ t("analysis.requirements") }}</div>
                      <div
                        v-for="[colour, summary] in colourEntries(targetExplanation(result))"
                        :key="colour"
                        class="target-detail-line"
                      >
                        <span>{{ COLOUR_CONFIG[colour].name }}</span>
                        <strong>{{ summary.totalEffective.toFixed(1) }} / {{ summary.neededSources }}</strong>
                        <span :class="summary.deficit > 0 ? 'prob-fail' : 'prob-pass'">
                          {{ summary.deficit > 0 ? `-${Math.ceil(summary.deficit)}` : t("common.pass") }}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div class="panel-subtitle mb-3">{{ t("analysis.notes") }}</div>
                      <p v-for="note in targetExplanation(result)?.notes ?? []" :key="note">
                        {{ note }}
                      </p>
                    </div>
                  </div>
                  <div class="target-contribution-list">
                    <div
                      v-for="[label, items] in contributionGroups(targetExplanation(result))"
                      :key="label"
                    >
                      <div class="panel-subtitle mb-3">{{ label }}</div>
                      <div class="target-source-list">
                        <span v-for="item in items" :key="item.cardName" class="target-source-chip">
                          {{ item.cardName }} x{{ item.quantity }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="divider my-6" />

            <div class="panel-subtitle mb-3">{{ t("analysis.editTargets") }}</div>
            <KeySpellEditor
              :targets="analysisStore.targets"
              :commander-identity="commander?.colourIdentity ?? []"
              @add="analysisStore.addTarget"
              @remove="analysisStore.removeTarget"
              @update="analysisStore.updateTarget"
            />
          </div>
        </section>

        <section class="card card-pad panel-card">
          <div class="panel-heading">
            <div>
              <div class="panel-title">{{ t("analysis.sourceBreakdown") }}</div>
              <div class="panel-copy">
                See which colours are short, which are covered, and where the deck is leaning on
                slower sources.
              </div>
            </div>
          </div>
          <div class="mt-6 flex flex-col gap-6">
            <SourceBreakdownTable
              :colour-summaries="report.overallColourSummary"
              :library-size="commander?.librarySize ?? 99"
            />

            <div class="divider my-6" />

            <div class="panel-subtitle mb-3">{{ t("analysis.recommendations") }}</div>
            <RecommendationPanel :recommendations="report.recommendations" />

            <div class="divider my-6" />

            <div class="panel-subtitle mb-3">{{ t("analysis.modelNotes") }}</div>
            <AssumptionWarnings
              :warnings="report.warnings"
              :assumptions="report.assumptions"
              :tapland-count="report.taplandCount"
              :land-count="report.landCount"
              :mode="report.mode"
            />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.analysis-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
  align-items: start;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border-strong);
}

.analysis-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.deck-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.deck-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.commander-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cmd-label {
  font-size: 12px;
  color: var(--text-muted);
}
.cmd-names {
  font-size: 13px;
  font-weight: 500;
}
.library-size {
  font-size: 12px;
  color: var(--text-muted);
}

.panel-card {
  height: 100%;
}

.summary-card {
  padding: 16px 18px;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--border);
  border-radius: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.summary-card:first-child {
  border-left: 0;
}

.summary-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.summary-value {
  font-family: var(--font-mono);
  font-size: 19px;
  line-height: 1.2;
}

.summary-detail {
  font-size: 12px;
  color: var(--text-muted);
}

.panel-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
  letter-spacing: 0.01em;
}
.panel-copy {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.panel-subtitle {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.results-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--border);
}

.result-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 12px;
  padding: 13px 2px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
}

.result-row.status-fail {
  box-shadow: inset 3px 0 0 var(--danger);
  padding-left: 12px;
}
.result-row.status-pass {
  box-shadow: inset 3px 0 0 var(--success);
  padding-left: 12px;
}

.result-name {
  min-width: 0;
}
.result-card {
  font-weight: 600;
  font-size: 13px;
  display: block;
}
.result-req {
  font-size: 11px;
  color: var(--text-muted);
}

.result-probs {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.prob-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.prob-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
}
.prob-val {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
}
.prob-pass {
  color: var(--success);
}
.prob-fail {
  color: var(--danger);
}

.result-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  justify-self: end;
}

.details-action {
  justify-self: end;
}

.target-details {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.target-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.target-detail-line {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
}

.target-contribution-list {
  display: grid;
  gap: 12px;
}

.target-source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.target-source-chip {
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 5px 7px;
  font-size: 12px;
}

.status-pass .result-status-badge,
.result-status-badge.status-pass {
  background: transparent;
  border: 1px solid var(--success);
  color: var(--success);
}
.status-fail .result-status-badge,
.result-status-badge.status-fail {
  background: transparent;
  border: 1px solid var(--danger);
  color: var(--danger);
}

@media (max-width: 900px) {
  .analysis-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .result-row {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .result-probs,
  .result-status-badge,
  .details-action {
    justify-self: start;
  }

  .target-detail-grid {
    grid-template-columns: 1fr;
  }

  .summary-card,
  .summary-card:first-child {
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .summary-card:first-child {
    border-top: 0;
  }
}
</style>
