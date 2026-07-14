<script setup lang="ts">
import { ref } from "vue";
import { AlertTriangle, Zap, ChevronUp, ChevronDown } from "lucide-vue-next";

defineProps<{
  warnings: string[];
  assumptions: string[];
  taplandCount: number;
  landCount: number;
  mode: "karsten" | "exact";
}>();

const showAssumptions = ref(false);
</script>

<template>
  <div class="assumption-warnings">
    <div v-for="(warn, i) in warnings" :key="i" class="alert alert-warning note-alert">
      <AlertTriangle :size="14" />
      {{ warn }}
    </div>

    <div v-if="mode === 'karsten'" class="alert alert-info note-alert">
      <Zap :size="14" />
      Strict Karsten mode: probabilities are hypergeometric estimates. Run
      <strong>Exact Simulation</strong> for Monte Carlo accuracy.
    </div>

    <button type="button" class="btn btn-ghost assumptions-toggle" @click="showAssumptions = !showAssumptions">
      <component :is="showAssumptions ? ChevronUp : ChevronDown" :size="12" class="mr-1" />
      Model assumptions ({{ assumptions.length }})
    </button>

    <div v-if="showAssumptions" class="assumptions-card">
      <ul class="assumptions-list">
        <li v-for="(a, i) in assumptions" :key="i" class="assumption-item">{{ a }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.assumption-warnings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assumptions-toggle {
  justify-content: flex-start;
  width: fit-content;
  min-height: 32px;
  padding-inline: 8px;
}

.assumptions-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: transparent;
}

.assumptions-list {
  display: flex;
  flex-direction: column;
}

.assumption-item {
  padding: 9px 12px;
  font-size: 12px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}

.assumption-item:first-child {
  border-top: 0;
}

.note-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
</style>
