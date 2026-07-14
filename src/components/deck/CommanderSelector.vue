<script setup lang="ts">
import type { CommanderInfo } from "../../domain/types";
import ColourIdentityBadge from "../shared/ColourIdentityBadge.vue";
import { AlertTriangle } from "lucide-vue-next";

defineProps<{
  commanderInfo: CommanderInfo | null;
  isLoading: boolean;
  unresolvedCards: string[];
}>();

</script>

<template>
  <div class="commander-panel">
    <div v-if="isLoading" class="loading-state">
      <div class="spinner" />
      <span>Fetching card data from Scryfall…</span>
    </div>

    <template v-else-if="commanderInfo">
      <div class="commander-header">
        <span class="section-label">Commander{{ commanderInfo.count > 1 ? "s" : "" }}</span>
        <ColourIdentityBadge :colours="commanderInfo.colourIdentity" />
      </div>
      <div class="commander-names">
        <span v-for="name in commanderInfo.names" :key="name" class="commander-name">{{
          name
        }}</span>
      </div>
      <div class="library-info">
        Library: <strong>{{ commanderInfo.librarySize }} cards</strong>
        <span class="muted"
          >(commander{{ commanderInfo.count > 1 ? "s" : "" }} in command zone)</span
        >
      </div>
    </template>

    <div v-if="unresolvedCards.length > 0" class="unresolved-warning">
      <AlertTriangle class="warn-icon" :size="14" />
      <span
        >{{ unresolvedCards.length }} card{{ unresolvedCards.length > 1 ? "s" : "" }} not found on
        Scryfall:</span
      >
      <ul>
        <li v-for="name in unresolvedCards.slice(0, 5)" :key="name">{{ name }}</li>
        <li v-if="unresolvedCards.length > 5">…and {{ unresolvedCards.length - 5 }} more</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.commander-panel {
  padding: 14px 16px;
  background: var(--surface-1);
  border-radius: 6px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.commander-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.commander-names {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.commander-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}

.library-info {
  font-size: 12px;
  color: var(--text-muted);
}

.library-info strong {
  color: var(--text);
}

.muted {
  opacity: 0.7;
  margin-left: 4px;
}

.unresolved-warning {
  padding: 8px 10px;
  background: transparent;
  border: 1px solid rgba(211, 32, 42, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #e06060;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.warn-icon {
  font-size: 14px;
}

ul {
  margin: 2px 0 0 14px;
  padding: 0;
}
li {
  font-family: var(--font-mono);
}
</style>
