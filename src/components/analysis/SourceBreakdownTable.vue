<script setup lang="ts">
import type { ColourSourceCount } from "../../domain/types";
import { COLOUR_CONFIG } from "../../domain/constants";
import { Check } from "lucide-vue-next";

defineProps<{
  colourSummaries: ColourSourceCount[];
  librarySize: number;
}>();

function deficitClass(level: string) {
  return {
    "level-none": level === "none",
    "level-low": level === "low",
    "level-moderate": level === "moderate",
    "level-high": level === "high",
  };
}

function barWidth(effective: number, needed: number) {
  if (needed <= 0) return 100;
  return Math.min(100, Math.round((effective / needed) * 100));
}
</script>

<template>
  <div class="source-table">
    <div class="table-wrap">
      <table class="source-table-v">
      <thead>
        <tr>
          <th>Colour</th>
          <th class="text-right">Land sources</th>
          <th class="text-right">Total effective</th>
          <th class="text-right">Needed (90%)</th>
          <th>Progress</th>
          <th class="text-right">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="summary in colourSummaries"
          :key="summary.colour"
          :class="deficitClass(summary.deficitLevel)"
        >
          <td>
            <span class="chip colour-chip" :class="`colour-${summary.colour.toLowerCase()}`">
              {{ summary.colour }}
            </span>
            <span class="colour-name">{{ COLOUR_CONFIG[summary.colour].name }}</span>
          </td>
          <td class="text-right">{{ summary.landSources.toFixed(1) }}</td>
          <td class="text-right">
            <strong>{{ summary.totalEffective.toFixed(1) }}</strong>
            <span v-if="summary.rockSources > 0" class="rock-addon"
              >+{{ summary.rockSources.toFixed(1) }} rocks</span
            >
          </td>
          <td class="text-right">{{ summary.neededSources }}</td>
          <td>
            <div class="progress-track">
              <div
                class="progress-bar"
                :style="{ width: `${barWidth(summary.totalEffective, summary.neededSources)}%` }"
              />
            </div>
          </td>
          <td class="text-right">
            <span v-if="summary.deficitLevel === 'none'" class="chip status-pass">
              <Check :size="11" class="mr-1" /> Pass
            </span>
            <span v-else class="chip status-fail">
              −{{ Math.ceil(summary.deficit) }}
            </span>
          </td>
        </tr>
      </tbody>
      </table>
    </div>

    <div v-if="colourSummaries.length === 0" class="alert alert-info">
      No colour requirements detected.
    </div>
  </div>
</template>

<style scoped>
.source-table {
  font-size: 13px;
  width: 100%;
  min-width: 0;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.source-table-v {
  width: max(100%, 760px);
  border-collapse: collapse;
  table-layout: fixed;
}

.colour-name {
  font-weight: 500;
  margin-left: 8px;
}

.rock-addon {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 6px;
}

.colour-chip {
  min-width: 32px;
}

.colour-w { background: #d7d7df; color: #18151f; }
.colour-u { background: #0e68ab; color: #fff; }
.colour-b { background: #393244; color: #fff; }
.colour-r { background: #d3202a; color: #fff; }
.colour-g { background: #00733e; color: #fff; }

.source-table-v th {
  padding: 10px 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  font-weight: 700;
  text-align: left;
  white-space: normal;
  line-height: 1.35;
}

.source-table-v td {
  padding: 11px 12px;
  border-top: 1px solid var(--border);
  vertical-align: middle;
}

.source-table-v th:first-child,
.source-table-v td:first-child {
  width: 160px;
}

.source-table-v th:nth-child(2),
.source-table-v td:nth-child(2),
.source-table-v th:nth-child(3),
.source-table-v td:nth-child(3),
.source-table-v th:nth-child(4),
.source-table-v td:nth-child(4),
.source-table-v th:nth-child(6),
.source-table-v td:nth-child(6) {
  white-space: nowrap;
}

.text-right {
  text-align: right;
}

.status-pass {
  border-color: var(--success);
  background: transparent;
  color: var(--success);
}

.status-fail {
  border-color: var(--danger);
  background: transparent;
  color: var(--danger);
}
</style>
