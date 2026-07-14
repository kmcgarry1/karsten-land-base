<script setup lang="ts">
const props = defineProps<{
  symbol: string; // e.g. "W", "U", "B", "R", "G", "C", "2", "X" etc.
  size?: "sm" | "md" | "lg";
}>();

const src = `https://svgs.scryfall.io/card-symbols/${encodeURIComponent(props.symbol.toUpperCase())}.svg`;
const sizeMap = { sm: "16px", md: "22px", lg: "30px" };
const dim = sizeMap[props.size ?? "md"];
</script>

<template>
  <img
    :src="src"
    :alt="`{${symbol}}`"
    :title="`{${symbol}}`"
    :style="{ width: dim, height: dim }"
    class="mana-symbol"
    loading="lazy"
  />
</template>

<style scoped>
.mana-symbol {
  display: inline-block;
  vertical-align: middle;
  border-radius: 50%;
}
</style>
