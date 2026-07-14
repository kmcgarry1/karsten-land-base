<script setup lang="ts">
import { Languages } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { localeOptions, setLocale, type SupportedLocale } from "../../i18n";

const { locale, t } = useI18n();

const selectedLocale = computed({
  get: () => locale.value as SupportedLocale,
  set: (value: SupportedLocale) => setLocale(value),
});
</script>

<template>
  <label class="utility-picker language-picker">
    <Languages :size="15" aria-hidden="true" />
    <span class="sr-only">{{ t("language.label") }}</span>
    <select v-model="selectedLocale" :aria-label="t('language.select')">
      <option v-for="option in localeOptions" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

<style scoped>
@media (max-width: 560px) {
  .language-picker :deep(select) {
    width: 28px;
  }
}
</style>
