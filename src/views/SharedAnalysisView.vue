<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeft, Download } from "lucide-vue-next";
import ColourIdentityBadge from "../components/shared/ColourIdentityBadge.vue";
import SourceBreakdownTable from "../components/analysis/SourceBreakdownTable.vue";
import RecommendationPanel from "../components/analysis/RecommendationPanel.vue";
import AssumptionWarnings from "../components/analysis/AssumptionWarnings.vue";
import type { SharedAnalysisPayload } from "../domain/types";
import { SharePayloadError, decodeSharedPayload } from "../services/sharelink";
import { useAnalysisStore } from "../stores/analysis";
import { useDeckStore } from "../stores/deck";
import { useSettingsStore } from "../stores/settings";

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const analysisStore = useAnalysisStore();
const deckStore = useDeckStore();
const settingsStore = useSettingsStore();

const payload = ref<SharedAnalysisPayload | null>(null);
const loadError = ref("");
const loadedFallback = ref(false);

const report = computed(() => payload.value?.report ?? null);
const failingTargets = computed(
  () => report.value?.spellResults.filter((item) => item.status === "fail") ?? [],
);

const shareCreatedAt = computed(() => formatDate(payload.value?.createdAt ?? null));
const shareExpiresAt = computed(() => formatDate(payload.value?.expiresAt ?? null));

function hydrateFromRoute() {
  loadedFallback.value = false;
  const queryValue = route.query.share;
  const encoded = typeof queryValue === "string" ? queryValue : "";
  if (!encoded) {
    payload.value = null;
    loadError.value = t("share.invalid");
    return;
  }

  try {
    payload.value = decodeSharedPayload(encoded);
    loadError.value = "";
  } catch (error) {
    payload.value = null;
    if (error instanceof SharePayloadError && error.code === "expired") {
      loadError.value = t("share.expired");
      return;
    }
    if (error instanceof SharePayloadError && error.code === "too-large") {
      loadError.value = t("share.tooLarge");
      return;
    }
    loadError.value = t("share.invalid");
  }
}

function loadFallbackIntoImport() {
  if (!payload.value) return;
  const fallback = payload.value.fallback;
  if (!fallback.rawText.trim()) return;

  deckStore.setRawText(fallback.rawText);
  deckStore.deckName = fallback.deckName;
  deckStore.setCommanderInfo(payload.value.report.commanderInfo);
  settingsStore.applySettings(fallback.settings);
  analysisStore.setTargets(fallback.targets);
  analysisStore.report = payload.value.report;
  loadedFallback.value = true;
  router.push("/");
}

function formatDate(timestamp: number | null): string {
  if (!timestamp || timestamp <= 0) return "";
  try {
    return new Intl.DateTimeFormat(locale.value, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

watch(
  () => route.query.share,
  () => {
    hydrateFromRoute();
  },
  { immediate: true },
);
</script>

<template>
  <div class="page-container shared-analysis-view">
    <section class="card card-tonal card-pad mb-4">
      <div class="shared-topbar">
        <button type="button" class="btn btn-tonal" @click="router.push('/')">
          <ArrowLeft :size="16" class="mr-1" />
          {{ t("common.back") }}
        </button>
      </div>
    </section>

    <div v-if="loadError" class="alert alert-error mb-4">
      {{ loadError }}
    </div>

    <template v-else-if="report">
      <div class="alert alert-info mb-4">{{ t("share.readOnlyBanner") }}</div>
      <div v-if="loadedFallback" class="alert alert-success mb-4">
        {{ t("share.importedFallback") }}
      </div>

      <section class="card card-pad mb-4">
        <div class="shared-header">
          <div>
            <div class="deck-name">{{ report.deckName || t("analysis.untitled") }}</div>
            <div class="commander-line">
              <span class="cmd-label"
                >{{
                  report.commanderInfo.count > 1 ? t("common.commanders") : t("common.commander")
                }}:</span
              >
              <span class="cmd-names">{{ report.commanderInfo.names.join(", ") }}</span>
              <ColourIdentityBadge :colours="report.commanderInfo.colourIdentity" size="sm" />
            </div>
          </div>
          <div class="shared-meta">
            <div v-if="shareCreatedAt" class="text-sm text-[var(--text-muted)]">
              {{ t("share.shareCreatedAt", { date: shareCreatedAt }) }}
            </div>
            <div v-if="shareExpiresAt" class="text-sm text-[var(--text-muted)]">
              {{ t("share.shareExpiresAt", { date: shareExpiresAt }) }}
            </div>
            <button
              type="button"
              class="btn btn-tonal"
              :disabled="!payload?.fallback.rawText"
              @click="loadFallbackIntoImport"
            >
              <Download :size="16" />
              {{ t("share.fallbackReady") }}
            </button>
          </div>
        </div>
      </section>

      <div class="summary-grid mb-4">
        <div class="summary-card">
          <div class="summary-label">{{ t("analysis.targetsPassing") }}</div>
          <div class="summary-value">
            {{ report.spellResults.length - failingTargets.length }}/{{
              report.spellResults.length
            }}
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">{{ t("analysis.baseComposition") }}</div>
          <div class="summary-value">
            {{ t("analysis.landCount", { count: report.landCount }) }}
          </div>
          <div class="summary-detail">
            {{ t("analysis.taplandCount", { count: report.taplandCount }) }}
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">{{ t("analysis.analysisMode") }}</div>
          <div class="summary-value">
            {{ report.mode === "exact" ? t("modes.exactShort") : t("modes.karstenShort") }}
          </div>
          <div class="summary-detail">
            {{ report.mode === "exact" ? t("analysis.monteCarlo") : t("analysis.heuristic") }}
          </div>
        </div>
      </div>

      <section class="card card-pad mb-4">
        <div class="panel-subtitle mb-3">{{ t("analysis.keySpells") }}</div>
        <div class="results-list">
          <div
            v-for="result in report.spellResults"
            :key="result.target.id"
            class="result-row"
            :class="`status-${result.status}`"
          >
            <div class="result-name">
              <span class="result-card">{{ result.target.cardName }}</span>
              <span class="result-req"
                >T{{ result.target.targetTurn }} · MV{{ result.target.totalManaValue }}</span
              >
            </div>
            <div class="result-probs">
              <span class="prob-label">Karsten</span>
              <span class="prob-val">{{ (result.heuristicProbability * 100).toFixed(1) }}%</span>
              <template v-if="result.exactProbability !== null">
                <span class="prob-label">Exact</span>
                <span class="prob-val">{{ (result.exactProbability * 100).toFixed(1) }}%</span>
              </template>
            </div>
            <span class="chip">{{
              result.status === "pass"
                ? t("common.pass")
                : result.status === "fail"
                  ? t("common.fail")
                  : "..."
            }}</span>
          </div>
        </div>
      </section>

      <section class="card card-pad mb-4">
        <div class="panel-subtitle mb-3">{{ t("analysis.sourceBreakdown") }}</div>
        <SourceBreakdownTable
          :colour-summaries="report.overallColourSummary"
          :library-size="report.commanderInfo.librarySize"
        />
      </section>

      <section class="card card-pad mb-4">
        <div class="panel-subtitle mb-3">{{ t("analysis.recommendations") }}</div>
        <RecommendationPanel :recommendations="report.recommendations" />
      </section>

      <section class="card card-pad">
        <div class="panel-subtitle mb-3">{{ t("analysis.modelNotes") }}</div>
        <AssumptionWarnings
          :warnings="report.warnings"
          :assumptions="report.assumptions"
          :tapland-count="report.taplandCount"
          :land-count="report.landCount"
          :mode="report.mode"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.shared-analysis-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shared-topbar {
  display: flex;
  justify-content: flex-start;
}

.shared-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.shared-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.deck-name {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
}

.commander-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--border);
}

.summary-card {
  padding: 14px;
  border-left: 1px solid var(--border);
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
  font-size: 18px;
}

.summary-detail {
  font-size: 12px;
  color: var(--text-muted);
}

.results-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

.result-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.result-name {
  min-width: 0;
}

.result-card {
  display: block;
  font-size: 13px;
  font-weight: 600;
}

.result-req {
  font-size: 12px;
  color: var(--text-muted);
}

.result-probs {
  display: grid;
  grid-template-columns: repeat(2, auto);
  gap: 2px 10px;
}

.prob-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.prob-val {
  font-family: var(--font-mono);
  font-size: 13px;
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .summary-card {
    border-left: 0;
    border-top: 1px solid var(--border);
  }

  .summary-card:first-child {
    border-top: 0;
  }

  .shared-meta {
    align-items: flex-start;
  }

  .result-row {
    grid-template-columns: 1fr;
  }
}
</style>
