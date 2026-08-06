<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ExternalLink, Link2, X } from "lucide-vue-next";
import { useAnalysisStore } from "../../stores/analysis";
import { useDeckStore } from "../../stores/deck";
import { useSettingsStore } from "../../stores/settings";
import {
  SharePayloadError,
  buildSharedAnalysisUrl,
  createSharedPayload,
  encodeSharedPayload,
} from "../../services/sharelink";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const analysisStore = useAnalysisStore();
const deckStore = useDeckStore();
const settingsStore = useSettingsStore();

const dialog = ref<HTMLDialogElement | null>(null);
const shareUrl = ref("");
const shareError = ref("");
const copied = ref(false);
const generating = ref(false);

onMounted(async () => {
  if (props.open) {
    await openDialog();
  }
});

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) await openDialog();
    else closeDialogInternal();
  },
);

async function openDialog() {
  if (!dialog.value?.open) dialog.value?.showModal();
  await generateShareUrl();
  await nextTick();
}

function closeDialogInternal() {
  if (dialog.value?.open) dialog.value.close();
}

function closeDialog() {
  closeDialogInternal();
  emit("close");
}

async function generateShareUrl() {
  shareUrl.value = "";
  shareError.value = "";
  copied.value = false;

  if (!analysisStore.report || !deckStore.commanderInfo) {
    shareError.value = t("share.unavailable");
    return;
  }

  generating.value = true;
  try {
    const payload = createSharedPayload({
      report: analysisStore.report,
      deckName: deckStore.deckName || t("analysis.untitled"),
      rawText: deckStore.rawText,
      settings: settingsStore.settings,
      targets: analysisStore.targets,
    });
    const encoded = encodeSharedPayload(payload);
    shareUrl.value = buildSharedAnalysisUrl(encoded);
  } catch (error) {
    if (error instanceof SharePayloadError && error.code === "too-large") {
      shareError.value = t("share.tooLarge");
    } else {
      shareError.value = t("share.copyFailed");
    }
  } finally {
    generating.value = false;
  }
}

async function copyLink() {
  copied.value = false;
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard?.writeText(shareUrl.value);
    copied.value = true;
  } catch {
    shareError.value = t("share.copyFailed");
  }
}

function openLink() {
  if (!shareUrl.value) return;
  window.open(shareUrl.value, "_blank", "noopener,noreferrer");
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="share-dialog"
      :aria-labelledby="'share-title'"
      :aria-describedby="'share-description'"
      @cancel.prevent="closeDialog"
    >
      <div class="share-shell">
        <header class="share-header">
          <div class="share-brand">
            <Link2 :size="18" aria-hidden="true" />
            <span>{{ t("share.title") }}</span>
          </div>
          <button
            type="button"
            class="share-close"
            :aria-label="t('common.close')"
            @click="closeDialog"
          >
            <X :size="18" />
          </button>
        </header>

        <main class="share-content">
          <h1 id="share-title">{{ t("share.title") }}</h1>
          <p id="share-description">{{ t("share.subtitle") }}</p>

          <div v-if="generating" class="alert alert-info">{{ t("share.generating") }}</div>
          <div v-else-if="shareError" class="alert alert-error">{{ shareError }}</div>
          <div v-else class="share-body">
            <label class="field-label" for="share-url">{{ t("share.linkField") }}</label>
            <input id="share-url" class="field" :value="shareUrl" readonly />
            <div class="share-actions">
              <button type="button" class="btn btn-primary" :disabled="!shareUrl" @click="copyLink">
                {{ t("share.copyLink") }}
              </button>
              <button type="button" class="btn btn-tonal" :disabled="!shareUrl" @click="openLink">
                <ExternalLink :size="14" />
                {{ t("share.openLink") }}
              </button>
            </div>
            <div v-if="copied" class="alert alert-success">{{ t("share.copied") }}</div>
            <p class="share-note">{{ t("share.privacyNote") }}</p>
          </div>
        </main>

        <footer class="share-footer">
          <button type="button" class="btn btn-tonal" @click="closeDialog">
            {{ t("common.done") }}
          </button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.share-dialog {
  width: min(640px, calc(100vw - 32px));
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0;
  background: var(--surface-0);
  color: var(--text);
  box-shadow: var(--shadow-elevated);
}

.share-dialog::backdrop {
  background: rgba(17, 14, 25, 0.45);
}

.share-shell {
  display: flex;
  flex-direction: column;
}

.share-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
}

.share-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.share-close {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
}

.share-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px;
}

.share-content h1 {
  font-family: var(--font-display);
  font-size: 1.4rem;
  line-height: 1.2;
}

.share-content p {
  color: var(--text-muted);
}

.share-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.share-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.share-note {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.share-footer {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
  padding: 12px 16px;
}

@media (max-width: 680px) {
  .share-actions {
    flex-direction: column;
  }
}
</style>
