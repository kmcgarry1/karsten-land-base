<script setup lang="ts">
import { computed } from "vue";
import { Monitor, Moon, Sun } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import {
  setThemePreference,
  themePreference,
  type ThemePreference,
} from "../../theme";

const { t } = useI18n();
const selectedTheme = computed({
  get: () => themePreference.value,
  set: (value: ThemePreference) => setThemePreference(value),
});
const themeIcon = computed(() => {
  if (selectedTheme.value === "light") return Sun;
  if (selectedTheme.value === "dark") return Moon;
  return Monitor;
});
</script>

<template>
  <label class="utility-picker theme-picker">
    <component :is="themeIcon" :size="15" aria-hidden="true" />
    <span class="sr-only">{{ t("theme.label") }}</span>
    <select v-model="selectedTheme" :aria-label="t('theme.select')">
      <option value="system">{{ t("theme.system") }}</option>
      <option value="light">{{ t("theme.light") }}</option>
      <option value="dark">{{ t("theme.dark") }}</option>
    </select>
  </label>
</template>

<style scoped>
@media (max-width: 560px) {
  .theme-picker :deep(select) {
    width: 28px;
  }
}
</style>
