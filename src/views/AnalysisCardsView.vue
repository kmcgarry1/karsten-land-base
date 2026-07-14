<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Dices,
  Grid2X2,
  ImageOff,
  List,
  RefreshCw,
  Zap,
} from "lucide-vue-next";
import ColourIdentityBadge from "../components/shared/ColourIdentityBadge.vue";
import { COLOUR_CONFIG } from "../domain/constants";
import type { CardAnalysisRow, MtgColour, SourceContribution } from "../domain/types";
import { useAnalysisStore } from "../stores/analysis";
import { useCardDataStore } from "../stores/cardData";
import { useDeckStore } from "../stores/deck";

type ViewMode = "table" | "grid";
type SortMode = "fail-first" | "lowest-probability" | "mana-value" | "name" | "colour";
type StatusFilter = "all" | "pass" | "fail" | "unscored";

const router = useRouter();
const deckStore = useDeckStore();
const analysisStore = useAnalysisStore();
const cardDataStore = useCardDataStore();

const viewMode = ref<ViewMode>("table");
const sortMode = ref<SortMode>("fail-first");
const statusFilter = ref<StatusFilter>("all");
const colourFilter = ref<"all" | MtgColour>("all");
const typeFilter = ref("all");
const exactOnly = ref(false);
const mvMin = ref(0);
const mvMax = ref(10);
const expandedRows = ref<Set<string>>(new Set());

const report = computed(() => analysisStore.report);
const commander = computed(() => deckStore.commanderInfo);
const hasParsedDeck = computed(() => (deckStore.parsed?.entries.length ?? 0) > 0);
const cardDataReady = computed(
  () => cardDataStore.resolutionStatus === "ready" || cardDataStore.resolutionStatus === "degraded",
);
const allRows = computed(() => analysisStore.allCardRows);

const availableTypes = computed(() => {
  const types = new Set<string>();
  for (const row of allRows.value) types.add(primaryType(row.card.typeLine));
  return [...types].sort((a, b) => a.localeCompare(b));
});

const filteredRows = computed(() => {
  const rows = allRows.value.filter((row) => {
    const result = row.karstenResult;
    const status = result?.status ?? "unscored";
    if (statusFilter.value !== "all" && status !== statusFilter.value) return false;
    if (colourFilter.value !== "all" && !row.target?.requiredPips[colourFilter.value]) return false;
    if (typeFilter.value !== "all" && primaryType(row.card.typeLine) !== typeFilter.value) {
      return false;
    }
    if (exactOnly.value && typeof row.exactProbability !== "number") return false;
    if (row.card.cmc < mvMin.value || row.card.cmc > mvMax.value) return false;
    return true;
  });
  return rows.sort(compareRows);
});

const passingCount = computed(
  () => allRows.value.filter((row) => row.karstenResult?.status === "pass").length,
);
const exactScoredCount = computed(
  () => allRows.value.filter((row) => typeof row.exactProbability === "number").length,
);
const scoredCount = computed(() => allRows.value.filter((row) => row.karstenResult).length);

async function reanalyse() {
  try {
    await analysisStore.analyse();
  } catch {
    // analysisStore.analysisError carries the user-safe message.
  }
}

async function runExactForVisible() {
  try {
    await analysisStore.runExactForCardRows(filteredRows.value.map((row) => row.id));
  } catch {
    // analysisStore.cardExactError carries the user-safe message.
  }
}

onUnmounted(() => {
  analysisStore.cancelSimulation();
});

function compareRows(a: CardAnalysisRow, b: CardAnalysisRow): number {
  if (sortMode.value === "name") return a.card.name.localeCompare(b.card.name);
  if (sortMode.value === "mana-value") return a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name);
  if (sortMode.value === "colour") return pipLabel(a).localeCompare(pipLabel(b)) || a.card.name.localeCompare(b.card.name);
  if (sortMode.value === "lowest-probability") return probability(a) - probability(b);

  const statusRank = (row: CardAnalysisRow) =>
    row.karstenResult?.status === "fail" ? 0 : row.karstenResult?.status === "pass" ? 1 : 2;
  return statusRank(a) - statusRank(b) || probability(a) - probability(b);
}

function probability(row: CardAnalysisRow): number {
  return row.karstenResult?.heuristicProbability ?? 2;
}

function toggleRow(rowId: string) {
  const next = new Set(expandedRows.value);
  if (next.has(rowId)) next.delete(rowId);
  else next.add(rowId);
  expandedRows.value = next;
}

function isExpanded(rowId: string): boolean {
  return expandedRows.value.has(rowId);
}

function statusLabel(row: CardAnalysisRow): string {
  if (!row.karstenResult) return "Unscored";
  if (row.karstenResult.status === "pass") return "Pass";
  if (row.karstenResult.status === "fail") return "Fail";
  return "Pending";
}

function statusClass(row: CardAnalysisRow): string {
  return row.karstenResult ? `status-${row.karstenResult.status}` : "status-unscored";
}

function formatProb(value: number | null | undefined): string {
  if (typeof value !== "number") return "Not run";
  return `${(value * 100).toFixed(1)}%`;
}

function scoreClass(row: CardAnalysisRow, value: number | null | undefined): string {
  if (!row.karstenResult || typeof value !== "number") return "score-muted";
  return value >= row.karstenResult.target.probabilityThreshold ? "score-pass" : "score-fail";
}

function pipLabel(row: CardAnalysisRow): string {
  if (!row.target) return "-";
  return Object.entries(row.target.requiredPips)
    .map(([colour, count]) => `${count}${colour}`)
    .join(" ");
}

function primaryType(typeLine: string): string {
  const beforeDash = typeLine.split(/[—-]/)[0]?.trim() ?? typeLine;
  const types = beforeDash.split(/\s+/).filter((part) => part && part !== "Legendary");
  return types[0] ?? "Other";
}

function colourEntries(row: CardAnalysisRow) {
  return Object.entries(row.sourceBreakdown?.sourceCounts ?? []) as Array<
    [MtgColour, NonNullable<CardAnalysisRow["sourceBreakdown"]>["sourceCounts"][MtgColour]]
  >;
}

function contributionGroups(row: CardAnalysisRow): Array<[string, SourceContribution[]]> {
  const groups = row.sourceBreakdown?.contributions;
  if (!groups) return [];
  const entries: Array<[string, SourceContribution[]]> = [
    ["Lands", groups.lands],
    ["Fetches", groups.fetches],
    ["Conditional", groups.conditional],
    ["Rocks and ramp", groups.rocksRamp],
    ["Opponent-dependent", groups.opponentDependent],
  ];
  return entries.filter((entry) => entry[1].length > 0);
}
</script>

<template>
  <div class="page-container analysis-cards-view">
    <section class="card card-tonal card-pad">
      <div class="page-head">
        <div class="head-left">
          <button type="button" class="btn btn-tonal" @click="router.push('/analysis')">
            <ArrowLeft :size="16" />
            Summary
          </button>
          <div class="deck-meta">
            <div class="deck-name">{{ deckStore.deckName || "Untitled Deck" }}</div>
            <div v-if="commander" class="commander-info">
              <span class="cmd-label">Commander{{ commander.count > 1 ? "s" : "" }}:</span>
              <span class="cmd-names">{{ commander.names.join(", ") }}</span>
              <ColourIdentityBadge :colours="commander.colourIdentity" size="sm" />
            </div>
          </div>
        </div>

        <div class="head-actions">
          <RouterLink :to="{ name: 'analysis' }" class="btn btn-tonal">
            <BarChart3 :size="16" />
            Summary view
          </RouterLink>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="analysisStore.isAnalysing"
            @click="reanalyse"
          >
            <RefreshCw :size="16" />
            {{ analysisStore.isAnalysing ? "Analysing..." : "Re-analyse" }}
          </button>
        </div>
      </div>

    </section>

    <div v-if="!report && !analysisStore.isAnalysing && !hasParsedDeck" class="alert alert-info">
      No deck imported yet. <RouterLink class="inline-action" to="/">Import a deck</RouterLink>
      to get started.
    </div>

    <div
      v-else-if="!report && !analysisStore.isAnalysing && hasParsedDeck && !cardDataReady"
      class="alert alert-warning"
    >
      Decklist is parsed, but card data is not ready.
      <RouterLink class="inline-action" to="/">Resolve card data</RouterLink>
      before viewing card images.
    </div>

    <div v-else-if="!report && !analysisStore.isAnalysing" class="alert alert-info">
      Card data is ready. <RouterLink class="inline-action" to="/">Run analysis from Import</RouterLink>.
    </div>

    <div v-if="analysisStore.analysisError" class="alert alert-error">
      {{ analysisStore.analysisError }}
    </div>

    <div v-if="analysisStore.cardExactError" class="alert alert-error">
      {{ analysisStore.cardExactError }}
    </div>

    <div v-if="report && cardDataStore.isDegraded" class="alert alert-warning">
      This report was produced with unresolved cards treated as unknown. Missing card images or
      scores may need a Scryfall retry.
    </div>

    <div v-if="analysisStore.cardExactRunning" class="card card-pad">
      <div class="pb-2 text-sm text-[var(--text-muted)]">
        Running exact simulation for visible cards...
        {{ Math.round(analysisStore.cardExactProgress * 100) }}%
      </div>
      <div class="progress-track">
        <div class="progress-bar" :style="{ width: `${analysisStore.cardExactProgress * 100}%` }" />
      </div>
    </div>

    <template v-if="report">
      <div class="overview-row">
        <div class="overview-stat">
          <span class="stat-label">Nonland cards</span>
          <span class="stat-value">{{ allRows.length }}</span>
        </div>
        <div class="overview-stat">
          <span class="stat-label">Karsten scored</span>
          <span class="stat-value">{{ scoredCount }}/{{ allRows.length }}</span>
        </div>
        <div class="overview-stat">
          <span class="stat-label">Exact scored</span>
          <span class="stat-value">{{ exactScoredCount }}/{{ allRows.length }}</span>
        </div>
        <div class="overview-stat">
          <span class="stat-label">Passing Karsten</span>
          <span class="stat-value">{{ passingCount }}/{{ scoredCount }}</span>
        </div>
      </div>

      <section class="card card-pad controls-panel">
        <div class="segmented">
          <button
            type="button"
            :class="{ active: viewMode === 'table' }"
            @click="viewMode = 'table'"
          >
            <List :size="15" />
            Table
          </button>
          <button
            type="button"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
          >
            <Grid2X2 :size="15" />
            Grid
          </button>
        </div>

        <label>
          Sort
          <select v-model="sortMode" class="field">
            <option value="fail-first">Fail first</option>
            <option value="lowest-probability">Lowest probability</option>
            <option value="mana-value">Mana value</option>
            <option value="name">Name</option>
            <option value="colour">Colour</option>
          </select>
        </label>

        <label>
          Status
          <select v-model="statusFilter" class="field">
            <option value="all">All</option>
            <option value="fail">Fail</option>
            <option value="pass">Pass</option>
            <option value="unscored">Unscored</option>
          </select>
        </label>

        <label>
          Colour
          <select v-model="colourFilter" class="field">
            <option value="all">All</option>
            <option v-for="colour in commander?.colourIdentity ?? []" :key="colour" :value="colour">
              {{ COLOUR_CONFIG[colour].name }}
            </option>
          </select>
        </label>

        <label>
          Type
          <select v-model="typeFilter" class="field">
            <option value="all">All</option>
            <option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</option>
          </select>
        </label>

        <label class="mv-filter">
          MV
          <span>
            <input v-model.number="mvMin" class="field mv-input" type="number" min="0" max="20" />
            <input v-model.number="mvMax" class="field mv-input" type="number" min="0" max="20" />
          </span>
        </label>

        <label class="check-filter">
          <input v-model="exactOnly" type="checkbox" />
          Exact scored
        </label>

        <button
          type="button"
          class="btn btn-primary exact-button"
          :disabled="analysisStore.cardExactRunning || filteredRows.length === 0"
          @click="runExactForVisible"
        >
          <Dices :size="16" />
          Run exact for visible
        </button>
      </section>

      <section v-if="filteredRows.length > 0 && viewMode === 'table'" class="table-wrap">
        <table class="card-table">
          <thead>
            <tr>
              <th></th>
              <th>Card</th>
              <th>MV</th>
              <th>Pips</th>
              <th>Turn</th>
              <th>Karsten</th>
              <th>Exact</th>
              <th>Status</th>
              <th>Bottleneck</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in filteredRows" :key="row.id">
              <tr :class="statusClass(row)">
                <td>
                  <button type="button" class="icon-button" @click="toggleRow(row.id)">
                    <ChevronDown v-if="isExpanded(row.id)" :size="15" />
                    <ChevronRight v-else :size="15" />
                  </button>
                </td>
                <td class="card-name">{{ row.card.name }}</td>
                <td>{{ row.card.cmc }}</td>
                <td>{{ pipLabel(row) }}</td>
                <td>{{ row.target?.targetTurn ?? "-" }}</td>
                <td :class="scoreClass(row, row.karstenResult?.heuristicProbability)">
                  {{ formatProb(row.karstenResult?.heuristicProbability) }}
                </td>
                <td :class="scoreClass(row, row.exactProbability)">
                  {{ formatProb(row.exactProbability) }}
                </td>
                <td>
                  <span class="status-chip" :class="statusClass(row)">
                    {{ statusLabel(row) }}
                  </span>
                </td>
                <td>{{ row.karstenResult?.colourBottleneck ?? "-" }}</td>
                <td>{{ row.isSelectedTarget ? "Selected" : "Card view" }}</td>
              </tr>
              <tr v-if="isExpanded(row.id)" class="details-row">
                <td></td>
                <td colspan="9">
                  <div class="details-panel">
                    <div v-if="row.sourceBreakdown" class="details-grid">
                      <div>
                        <h3>Requirements</h3>
                        <div
                          v-for="[colour, summary] in colourEntries(row)"
                          :key="colour"
                          class="detail-line"
                        >
                          <span>{{ COLOUR_CONFIG[colour].name }}</span>
                          <strong>
                            {{ summary?.totalEffective.toFixed(1) }} / {{ summary?.neededSources }}
                          </strong>
                          <span :class="(summary?.deficit ?? 0) > 0 ? 'score-fail' : 'score-pass'">
                            {{ (summary?.deficit ?? 0) > 0 ? `-${Math.ceil(summary?.deficit ?? 0)}` : "Pass" }}
                          </span>
                        </div>
                      </div>
                      <div>
                        <h3>Notes</h3>
                        <p v-for="note in row.sourceBreakdown.notes" :key="note">{{ note }}</p>
                      </div>
                    </div>
                    <div v-if="row.sourceBreakdown" class="contribution-list">
                      <div v-for="[label, items] in contributionGroups(row)" :key="label">
                        <h3>{{ label }}</h3>
                        <div class="contribution-items">
                          <span v-for="item in items" :key="item.cardName" class="source-chip">
                            {{ item.cardName }} x{{ item.quantity }}
                            <small>{{ item.colours.join("/") }} {{ item.note }}</small>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div v-else>No castable coloured mana cost detected for this card.</div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>

      <section v-else-if="filteredRows.length > 0" class="card-grid" aria-label="Card probability results">
        <article
          v-for="row in filteredRows"
          :key="row.id"
          class="card-result"
          :class="statusClass(row)"
        >
          <div class="image-frame">
            <img
              v-if="row.image"
              class="card-image"
              :src="row.image"
              :alt="row.card.name"
              loading="lazy"
            />
            <div v-else class="image-missing">
              <ImageOff :size="32" />
              <span>No image</span>
            </div>
          </div>

          <div class="score-panel">
            <div class="score-head">
              <div class="card-title">
                {{ row.card.name }}
                <span v-if="row.card.quantity > 1" class="quantity">x{{ row.card.quantity }}</span>
              </div>
              <span class="status-chip" :class="statusClass(row)">{{ statusLabel(row) }}</span>
            </div>

            <div v-if="row.target" class="target-line">
              Turn {{ row.target.targetTurn }} · MV {{ row.target.totalManaValue }} · {{ pipLabel(row) }}
            </div>
            <div v-else class="target-line">No castable coloured mana cost detected.</div>

            <div class="score-grid">
              <div class="score-box">
                <span class="score-label"><Zap :size="13" /> Karsten</span>
                <span
                  class="score-value"
                  :class="scoreClass(row, row.karstenResult?.heuristicProbability)"
                >
                  {{ formatProb(row.karstenResult?.heuristicProbability) }}
                </span>
              </div>
              <div class="score-box">
                <span class="score-label"><Dices :size="13" /> Exact</span>
                <span class="score-value" :class="scoreClass(row, row.exactProbability)">
                  {{ formatProb(row.exactProbability) }}
                </span>
              </div>
            </div>

            <button type="button" class="inline-action" @click="toggleRow(row.id)">
              {{ isExpanded(row.id) ? "Hide details" : "Details" }}
            </button>
            <div v-if="isExpanded(row.id)" class="grid-details">
              <p v-for="note in row.sourceBreakdown?.notes ?? []" :key="note">{{ note }}</p>
              <div v-for="[label, items] in contributionGroups(row)" :key="label">
                <strong>{{ label }}</strong>
                <span v-for="item in items.slice(0, 8)" :key="item.cardName" class="source-chip">
                  {{ item.cardName }}
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <div v-else class="card card-pad empty-state">No cards match the current filters.</div>
    </template>
  </div>
</template>

<style scoped>
.analysis-cards-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-head,
.head-left,
.head-actions,
.commander-info,
.segmented,
.controls-panel {
  display: flex;
  align-items: center;
}

.page-head {
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.head-left,
.head-actions {
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}

.deck-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.deck-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.commander-info {
  gap: 8px;
  flex-wrap: wrap;
}

.cmd-label,
.cmd-names,
.target-line,
.score-label,
.stat-label {
  color: var(--text-muted);
  font-size: 12px;
}

.overview-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border-strong);
}

.overview-stat {
  border: 0;
  border-left: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  padding: 15px 17px;
}

.overview-stat:first-child {
  border-left: 0;
}

.stat-value {
  display: block;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 21px;
  font-weight: 800;
}

.controls-panel {
  gap: 12px;
  flex-wrap: wrap;
}

.controls-panel label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.segmented {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.segmented button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-weight: 700;
}

.segmented button.active {
  background: var(--surface-2);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--accent);
}

.mv-filter span {
  display: flex;
  gap: 6px;
}

.mv-input {
  width: 64px;
}

.check-filter {
  justify-content: end;
  min-height: 54px;
}

.check-filter input {
  accent-color: var(--accent);
}

.exact-button {
  margin-left: auto;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.card-table {
  width: max(100%, 980px);
  border-collapse: collapse;
}

.card-table th,
.card-table td {
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  text-align: left;
  vertical-align: middle;
}

.card-table th {
  border-top: 0;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.card-name {
  font-weight: 800;
}

.icon-button {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: transparent;
  color: var(--text);
}

.status-chip {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.status-pass {
  border-color: var(--success);
}

.status-fail {
  border-color: var(--danger);
}

.status-chip.status-pass,
.score-pass {
  color: var(--success);
}

.status-chip.status-fail,
.score-fail {
  color: var(--danger);
}

.status-chip.status-unscored,
.score-muted {
  color: var(--text-muted);
}

.details-row td {
  background: var(--surface-1);
}

.details-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.details-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.details-panel h3 {
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.detail-line {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  padding: 5px 0;
}

.contribution-list {
  display: grid;
  gap: 14px;
}

.contribution-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.source-chip {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 6px 8px;
  font-size: 12px;
}

.source-chip small {
  color: var(--text-muted);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  align-items: start;
}

.card-result {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface-0);
}

.image-frame {
  display: flex;
  width: 100%;
  aspect-ratio: 488 / 680;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.22);
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-missing,
.score-panel,
.score-head {
  display: flex;
}

.image-missing {
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.score-panel {
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.score-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.card-title {
  min-width: 0;
  font-weight: 800;
  line-height: 1.2;
}

.quantity {
  margin-left: 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.score-box {
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 10px;
}

.score-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.score-value {
  display: block;
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 21px;
  font-weight: 900;
  line-height: 1;
}

.grid-details {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
  color: var(--text-muted);
  font-size: 12px;
}

.empty-state {
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .overview-row,
  .details-grid {
    grid-template-columns: 1fr;
  }

  .exact-button {
    width: 100%;
    margin-left: 0;
  }

  .overview-stat,
  .overview-stat:first-child {
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .overview-stat:first-child {
    border-top: 0;
  }
}
</style>
