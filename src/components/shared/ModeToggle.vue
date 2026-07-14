<script setup lang="ts">
import { Zap, Dices } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps<{
  modelValue: "karsten" | "exact";
}>();

const emit = defineEmits<{
  "update:modelValue": [value: "karsten" | "exact"];
}>();
</script>

<template>
  <div class="mode-toggle" role="group" :aria-label="t('modes.label')">
    <button
      type="button"
      class="mode-btn"
      :class="{ active: modelValue === 'karsten' }"
      :aria-pressed="modelValue === 'karsten'"
      @click="emit('update:modelValue', 'karsten')"
    >
      <span class="mode-main">
        <Zap class="mode-icon" :size="16" />
        {{ t("modes.karsten") }}
      </span>
      <span class="mode-desc">{{ t("modes.karstenDescription") }}</span>
    </button>
    <button
      type="button"
      class="mode-btn"
      :class="{ active: modelValue === 'exact' }"
      :aria-pressed="modelValue === 'exact'"
      @click="emit('update:modelValue', 'exact')"
    >
      <span class="mode-main">
        <Dices class="mode-icon" :size="16" />
        {{ t("modes.exact") }}
      </span>
      <span class="mode-desc">{{ t("modes.exactDescription") }}</span>
    </button>
  </div>
</template>

<style scoped>
.mode-toggle {
  display: inline-flex;
  overflow: hidden;
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  padding: 0;
  gap: 0;
}

.mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border-left: 1px solid var(--border);
  border-radius: 0;
  padding: 7px 12px;
  color: var(--text-muted);
}

.mode-btn.active {
  background: var(--surface-2);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--accent);
}

.mode-btn:first-child {
  border-left: 0;
}

.mode-btn:hover:not(.active) {
  background: var(--surface-2);
  color: var(--text);
}

.mode-icon {
  display: flex;
}

.mode-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}

.mode-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}
.mode-desc {
  font-size: 10px;
  opacity: 0.8;
}
</style>
