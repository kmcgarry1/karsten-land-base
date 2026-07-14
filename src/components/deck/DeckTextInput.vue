<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { SECURITY_LIMITS } from "../../security/limits";

const { t } = useI18n();

defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  actionLabel?: string;
  showAction?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  import: [];
}>();

const isDragging = ref(false);

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const text = e.dataTransfer?.getData("text");
  if (text) emit("update:modelValue", text);
}

function handleInput(e: Event) {
  emit("update:modelValue", (e.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div class="deck-input-wrapper">
    <div class="input-header">
      <span class="input-label">{{ t("deckInput.label") }}</span>
      <span class="input-hint">{{ t("deckInput.hint") }}</span>
    </div>
    <div
      class="textarea-wrapper"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <textarea
        class="deck-textarea"
        :value="modelValue"
        :placeholder="
          placeholder ??
          `// Commander\n1 Muldrotha, the Gravetide\n\n1 Command Tower\n1 Exotic Orchard\n1 Breeding Pool\n...`
        "
        :disabled="disabled"
        :maxlength="SECURITY_LIMITS.deckTextCharacters"
        rows="18"
        spellcheck="false"
        @input="handleInput"
      />
    </div>

    <div class="input-footer">
      <span class="chip entries-chip">
        {{
          t("deckInput.entries", {
            count: modelValue
              .split("\n")
              .filter((l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("#"))
              .length,
          })
        }}
      </span>
      <button
        v-if="showAction ?? true"
        class="btn btn-primary"
        type="button"
        :disabled="!modelValue.trim() || disabled"
        @click="emit('import')"
      >
        {{ actionLabel ?? t("deckInput.review") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.deck-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.input-label {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
}

.input-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.textarea-wrapper {
  border-radius: 2px;
  border: 1px solid var(--border-strong);
  transition: border-color 0.15s;
  overflow: hidden;
  background: var(--surface-0);
}

.textarea-wrapper.dragging,
.textarea-wrapper:focus-within {
  border-color: var(--accent);
}

.deck-textarea {
  width: 100%;
  font-family: var(--font-mono);
  min-height: 420px;
  resize: vertical;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 14px;
  font-size: 13px;
  line-height: 1.65;
  outline: none;
}

.deck-textarea::placeholder {
  color: var(--text-muted);
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-inline: 4px;
}

.entries-chip {
  color: var(--text-muted);
}
</style>
