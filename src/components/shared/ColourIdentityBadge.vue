<script setup lang="ts">
import type { MtgColour } from "../../domain/types";

defineProps<{
  colours: MtgColour[];
  size?: "sm" | "md" | "lg";
}>();
</script>

<template>
  <div class="colour-identity">
    <span
      v-for="colour in colours"
      :key="colour"
      class="identity-chip"
      :class="`colour-${colour.toLowerCase()}`"
    >
      {{ colour }}
    </span>
    <span v-if="colours.length === 0" class="identity-chip colour-c">
      C
    </span>
  </div>
</template>

<style scoped>
.colour-identity {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.identity-chip {
  display: inline-flex;
  min-height: 22px;
  min-width: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
}

.colour-w { background: #d7d7df; color: #18151f; }
.colour-u { background: #0e68ab; color: #fff; }
.colour-b { background: #393244; color: #fff; }
.colour-r { background: #d3202a; color: #fff; }
.colour-g { background: #00733e; color: #fff; }
.colour-c { background: var(--surface-3); color: var(--text); }
</style>
