<script setup lang="ts">
import { computed } from "vue";
import type { Recommendation } from "../../domain/types";
import { COLOUR_CONFIG } from "../../domain/constants";
import { Mountain, ArrowLeftRight, TrendingDown, Gem, Info } from "lucide-vue-next";
import type { Component } from "vue";

const props = defineProps<{
  recommendations: Recommendation[];
}>();

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const sorted = computed(() =>
  [...props.recommendations].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  ),
);

const ICONS: Record<string, Component> = {
  "add-land": Mountain,
  "swap-for-better-dual": ArrowLeftRight,
  "lower-requirement": TrendingDown,
  "add-rock": Gem,
  info: Info,
};
</script>

<template>
  <div class="recommendation-list">
    <div v-if="sorted.length === 0" class="alert alert-success">
      No recommendations — mana base looks healthy!
    </div>

    <div
      v-for="rec in sorted"
      :key="rec.id"
      class="rec-card"
      :class="`priority-${rec.priority}`"
    >
      <div class="rec-row">
        <div class="rec-icon"><component :is="ICONS[rec.type] ?? Info" :size="18" /></div>
        <div class="rec-content">
          <p class="rec-desc">{{ rec.description }}</p>
          <p v-if="rec.tradeOffNote" class="rec-note">{{ rec.tradeOffNote }}</p>
          <div v-if="rec.affectedColours.length > 0" class="rec-colours">
            <span
              v-for="c in rec.affectedColours"
              :key="c"
              class="chip rec-colour-chip"
            >
              {{ COLOUR_CONFIG[c].name }}
            </span>
          </div>
        </div>
        <span class="chip priority-chip" :class="`priority-chip-${rec.priority}`">
          {{ rec.priority }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--success);
  font-size: 13px;
}

.rec-card {
  border: 1px solid var(--border);
  border-radius: 2px;
  background: transparent;
}

.rec-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
}

.rec-icon {
  flex-shrink: 0;
  margin-top: 1px;
  display: flex;
  color: var(--text-muted);
}

.rec-content {
  flex: 1;
}

.rec-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
}
.rec-note {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

.rec-colours {
  display: flex;
  gap: 3px;
  margin-top: 6px;
}

.rec-colour-chip {
  min-height: 20px;
}

.priority-chip {
  text-transform: capitalize;
}

.priority-chip-high {
  border-color: var(--danger);
  background: transparent;
  color: var(--danger);
}

.priority-chip-medium {
  border-color: var(--warn);
  background: transparent;
  color: var(--warn);
}

.priority-chip-low {
  color: var(--text-muted);
}
</style>
