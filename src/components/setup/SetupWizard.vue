<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Check, Gauge, Settings2, SlidersHorizontal, Users, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { ALL_COLOURS, type MtgColour } from "../../domain/types";
import type { AnalysisSettings } from "../../domain/types";
import { markOnboardingComplete } from "../../onboarding";
import { useSettingsStore } from "../../stores/settings";

type StepId = "welcome" | "mode" | "threshold" | "assumptions" | "pod" | "iterations" | "review";
type AssumptionProfile = "recommended" | "strict" | "custom";

const props = defineProps<{ firstRun: boolean }>();
const emit = defineEmits<{ complete: []; dismiss: [] }>();
const { t } = useI18n();
const settingsStore = useSettingsStore();
const dialog = ref<HTMLDialogElement | null>(null);
const stepHeading = ref<HTMLElement | null>(null);
const stepIndex = ref(0);
const draft = ref<AnalysisSettings>({ ...settingsStore.settings, knownPodColours: [...settingsStore.settings.knownPodColours] });

const originalCustomAssumptions = {
  countTaplandsTurnTwo: draft.value.countTaplandsTurnTwo,
  countMDFCsAsLands: draft.value.countMDFCsAsLands,
  countOrchardAsThreeQuarter: draft.value.countOrchardAsThreeQuarter,
  countFellwarAsHalf: draft.value.countFellwarAsHalf,
};
const initialProfile = profileFor(draft.value);
const selectedProfile = ref<AssumptionProfile>(initialProfile);
const showCustomProfile = initialProfile === "custom";

const steps = computed<StepId[]>(() => [
  "welcome",
  "mode",
  "threshold",
  "assumptions",
  "pod",
  ...(draft.value.mode === "exact" ? (["iterations"] as StepId[]) : []),
  "review",
]);
const currentStep = computed(() => steps.value[Math.min(stepIndex.value, steps.value.length - 1)] ?? "welcome");
const progress = computed(() => ((stepIndex.value + 1) / steps.value.length) * 100);
const isLastStep = computed(() => currentStep.value === "review");

const colourLabels: Record<MtgColour, string> = {
  W: "settings.colours.W",
  U: "settings.colours.U",
  B: "settings.colours.B",
  R: "settings.colours.R",
  G: "settings.colours.G",
};

onMounted(async () => {
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
  await focusStep();
});

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close();
});

watch(currentStep, focusStep);

function profileFor(settings: AnalysisSettings): AssumptionProfile {
  const values = [
    settings.countTaplandsTurnTwo,
    settings.countMDFCsAsLands,
    settings.countOrchardAsThreeQuarter,
    settings.countFellwarAsHalf,
  ];
  if (values.every(Boolean)) return "recommended";
  if (values.every((value) => !value)) return "strict";
  return "custom";
}

function chooseProfile(profile: AssumptionProfile) {
  selectedProfile.value = profile;
  const next =
    profile === "custom"
      ? originalCustomAssumptions
      : {
          countTaplandsTurnTwo: profile === "recommended",
          countMDFCsAsLands: profile === "recommended",
          countOrchardAsThreeQuarter: profile === "recommended",
          countFellwarAsHalf: profile === "recommended",
        };
  Object.assign(draft.value, next);
}

function togglePodColour(colour: MtgColour) {
  const current = draft.value.knownPodColours;
  draft.value.knownPodColours = current.includes(colour)
    ? current.filter((entry) => entry !== colour)
    : [...current, colour];
}

function nextStep() {
  if (isLastStep.value) {
    settingsStore.applySettings(draft.value);
    markOnboardingComplete();
    emit("complete");
    return;
  }
  stepIndex.value = Math.min(stepIndex.value + 1, steps.value.length - 1);
}

function previousStep() {
  stepIndex.value = Math.max(0, stepIndex.value - 1);
}

function dismiss() {
  if (props.firstRun) markOnboardingComplete();
  emit("dismiss");
}

async function focusStep() {
  await nextTick();
  stepHeading.value?.focus();
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="setup-dialog"
      :aria-labelledby="`setup-title-${currentStep}`"
      :aria-describedby="`setup-description-${currentStep}`"
      @cancel.prevent="dismiss"
    >
      <div class="wizard-shell">
        <header class="wizard-header">
          <div class="wizard-brand">
            <SlidersHorizontal :size="18" aria-hidden="true" />
            <span>{{ t("wizard.setup") }}</span>
          </div>
          <span class="wizard-progress-label">
            {{ t("wizard.progress", { current: stepIndex + 1, total: steps.length }) }}
          </span>
          <button type="button" class="wizard-close" :aria-label="t('wizard.close')" @click="dismiss">
            <X :size="18" />
          </button>
        </header>

        <div class="wizard-progress" aria-hidden="true">
          <div :style="{ width: `${progress}%` }" />
        </div>

        <main class="wizard-content">
          <section v-if="currentStep === 'welcome'" class="wizard-step welcome-step">
            <SlidersHorizontal class="step-icon" :size="30" aria-hidden="true" />
            <h1 :id="`setup-title-${currentStep}`" ref="stepHeading" tabindex="-1">
              {{ t("wizard.welcome.title") }}
            </h1>
            <p :id="`setup-description-${currentStep}`">
              {{ t(firstRun ? "wizard.welcome.firstRun" : "wizard.welcome.reopen") }}
            </p>
            <div class="explanation-note">{{ t("wizard.welcome.note") }}</div>
          </section>

          <section v-else-if="currentStep === 'mode'" class="wizard-step">
            <Gauge class="step-icon" :size="26" aria-hidden="true" />
            <h1 :id="`setup-title-${currentStep}`" ref="stepHeading" tabindex="-1">
              {{ t("wizard.mode.title") }}
            </h1>
            <p :id="`setup-description-${currentStep}`">{{ t("wizard.mode.description") }}</p>
            <fieldset class="choice-list">
              <legend class="sr-only">{{ t("wizard.mode.title") }}</legend>
              <label class="choice-card">
                <input v-model="draft.mode" type="radio" value="karsten" />
                <span><strong>{{ t("modes.karsten") }}</strong><small>{{ t("wizard.mode.karsten") }}</small></span>
              </label>
              <label class="choice-card">
                <input v-model="draft.mode" type="radio" value="exact" />
                <span><strong>{{ t("modes.exact") }}</strong><small>{{ t("wizard.mode.exact") }}</small></span>
              </label>
            </fieldset>
          </section>

          <section v-else-if="currentStep === 'threshold'" class="wizard-step">
            <Gauge class="step-icon" :size="26" aria-hidden="true" />
            <h1 :id="`setup-title-${currentStep}`" ref="stepHeading" tabindex="-1">
              {{ t("wizard.threshold.title") }}
            </h1>
            <p :id="`setup-description-${currentStep}`">{{ t("wizard.threshold.description") }}</p>
            <fieldset class="choice-list choice-list-three">
              <legend class="sr-only">{{ t("wizard.threshold.title") }}</legend>
              <label v-for="option in [0.8, 0.9, 0.95]" :key="option" class="choice-card compact-choice">
                <input v-model.number="draft.targetThreshold" type="radio" :value="option" />
                <span>
                  <strong>{{ t(`wizard.threshold.options.${option === 0.8 ? 'relaxed' : option === 0.9 ? 'recommended' : 'strict'}`) }}</strong>
                  <small>{{ Math.round(option * 100) }}%</small>
                </span>
              </label>
            </fieldset>
          </section>

          <section v-else-if="currentStep === 'assumptions'" class="wizard-step">
            <Settings2 class="step-icon" :size="26" aria-hidden="true" />
            <h1 :id="`setup-title-${currentStep}`" ref="stepHeading" tabindex="-1">
              {{ t("wizard.assumptions.title") }}
            </h1>
            <p :id="`setup-description-${currentStep}`">{{ t("wizard.assumptions.description") }}</p>
            <fieldset class="choice-list">
              <legend class="sr-only">{{ t("wizard.assumptions.title") }}</legend>
              <label class="choice-card">
                <input
                  type="radio"
                  name="assumption-profile"
                  value="recommended"
                  :checked="selectedProfile === 'recommended'"
                  @change="chooseProfile('recommended')"
                />
                <span><strong>{{ t("wizard.assumptions.recommended") }}</strong><small>{{ t("wizard.assumptions.recommendedHelp") }}</small></span>
              </label>
              <label class="choice-card">
                <input
                  type="radio"
                  name="assumption-profile"
                  value="strict"
                  :checked="selectedProfile === 'strict'"
                  @change="chooseProfile('strict')"
                />
                <span><strong>{{ t("wizard.assumptions.strict") }}</strong><small>{{ t("wizard.assumptions.strictHelp") }}</small></span>
              </label>
              <label v-if="showCustomProfile" class="choice-card">
                <input
                  type="radio"
                  name="assumption-profile"
                  value="custom"
                  :checked="selectedProfile === 'custom'"
                  @change="chooseProfile('custom')"
                />
                <span><strong>{{ t("wizard.assumptions.custom") }}</strong><small>{{ t("wizard.assumptions.customHelp") }}</small></span>
              </label>
            </fieldset>
          </section>

          <section v-else-if="currentStep === 'pod'" class="wizard-step">
            <Users class="step-icon" :size="26" aria-hidden="true" />
            <h1 :id="`setup-title-${currentStep}`" ref="stepHeading" tabindex="-1">
              {{ t("wizard.pod.title") }}
            </h1>
            <p :id="`setup-description-${currentStep}`">{{ t("wizard.pod.description") }}</p>
            <div class="pod-colours" role="group" :aria-label="t('wizard.pod.title')">
              <button
                v-for="colour in ALL_COLOURS"
                :key="colour"
                type="button"
                class="pod-colour"
                :class="[`colour-${colour.toLowerCase()}`, { selected: draft.knownPodColours.includes(colour) }]"
                :aria-pressed="draft.knownPodColours.includes(colour)"
                @click="togglePodColour(colour)"
              >
                <span>{{ colour }}</span>
                {{ t(colourLabels[colour]) }}
              </button>
            </div>
            <div class="explanation-note">{{ t("wizard.pod.optional") }}</div>
          </section>

          <section v-else-if="currentStep === 'iterations'" class="wizard-step">
            <Gauge class="step-icon" :size="26" aria-hidden="true" />
            <h1 :id="`setup-title-${currentStep}`" ref="stepHeading" tabindex="-1">
              {{ t("wizard.iterations.title") }}
            </h1>
            <p :id="`setup-description-${currentStep}`">{{ t("wizard.iterations.description") }}</p>
            <fieldset class="choice-list choice-list-two">
              <legend class="sr-only">{{ t("wizard.iterations.title") }}</legend>
              <label v-for="option in [10000, 50000, 100000, 200000]" :key="option" class="choice-card compact-choice">
                <input v-model.number="draft.simulationIterations" type="radio" :value="option" />
                <span><strong>{{ option.toLocaleString() }}</strong><small>{{ t(`wizard.iterations.options.${option}`) }}</small></span>
              </label>
            </fieldset>
          </section>

          <section v-else class="wizard-step review-step">
            <Check class="step-icon" :size="26" aria-hidden="true" />
            <h1 :id="`setup-title-${currentStep}`" ref="stepHeading" tabindex="-1">
              {{ t("wizard.review.title") }}
            </h1>
            <p :id="`setup-description-${currentStep}`">{{ t("wizard.review.description") }}</p>
            <dl class="review-list">
              <div><dt>{{ t("modes.label") }}</dt><dd>{{ t(draft.mode === "exact" ? "modes.exact" : "modes.karsten") }}</dd></div>
              <div><dt>{{ t("settings.threshold") }}</dt><dd>{{ Math.round(draft.targetThreshold * 100) }}%</dd></div>
              <div><dt>{{ t("wizard.assumptions.title") }}</dt><dd>{{ t(`wizard.assumptions.${selectedProfile}`) }}</dd></div>
              <div><dt>{{ t("wizard.pod.title") }}</dt><dd>{{ draft.knownPodColours.length ? draft.knownPodColours.join(", ") : t("wizard.review.unknownPod") }}</dd></div>
              <div v-if="draft.mode === 'exact'"><dt>{{ t("settings.iterations") }}</dt><dd>{{ draft.simulationIterations.toLocaleString() }}</dd></div>
            </dl>
          </section>
        </main>

        <footer class="wizard-footer">
          <button v-if="stepIndex > 0" type="button" class="btn btn-ghost" @click="previousStep">
            {{ t("wizard.back") }}
          </button>
          <button v-else type="button" class="btn btn-ghost" @click="dismiss">
            {{ t(firstRun ? "wizard.skip" : "wizard.cancel") }}
          </button>
          <button type="button" class="btn btn-primary" @click="nextStep">
            {{ t(isLastStep ? "wizard.finish" : currentStep === "welcome" ? "wizard.start" : "wizard.continue") }}
          </button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.setup-dialog {
  width: min(680px, calc(100vw - 32px));
  max-width: none;
  max-height: min(760px, calc(100dvh - 32px));
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--surface-0);
  color: var(--text);
  padding: 0;
}

.setup-dialog::backdrop {
  background: rgba(12, 9, 20, 0.76);
}

.wizard-shell {
  display: flex;
  max-height: inherit;
  flex-direction: column;
}

.wizard-header,
.wizard-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
}

.wizard-header {
  border-bottom: 1px solid var(--border);
}

.wizard-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
}

.wizard-brand svg,
.step-icon {
  color: var(--accent);
}

.wizard-progress-label {
  margin-left: auto;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.wizard-close {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--text-muted);
}

.wizard-progress {
  height: 3px;
  background: var(--surface-3);
}

.wizard-progress > div {
  height: 100%;
  background: var(--accent);
  transition: width 0.18s ease;
}

.wizard-content {
  min-height: 440px;
  overflow-y: auto;
  padding: 42px 48px;
}

.wizard-step {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wizard-step h1 {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.35rem);
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.08;
  outline: none;
}

.wizard-step > p {
  max-width: 570px;
  color: var(--text-muted);
  line-height: 1.65;
}

.welcome-step {
  justify-content: center;
  min-height: 340px;
}

.choice-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.choice-list-two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.choice-list-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.choice-card {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 14px;
  cursor: pointer;
}

.choice-card:has(input:checked) {
  border-color: var(--accent);
  background: var(--surface-1);
  box-shadow: inset 3px 0 0 var(--accent);
}

.choice-card input {
  margin-top: 3px;
  accent-color: var(--accent);
}

.choice-card span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.choice-card small,
.explanation-note {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.compact-choice {
  align-items: center;
}

.pod-colours {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.pod-colour {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 12px 5px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.pod-colour span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text);
}

.pod-colour.colour-w span { background: #d7d7df; color: #18151f; }
.pod-colour.colour-u span { background: #0e68ab; color: #fff; }
.pod-colour.colour-b span { background: #393244; color: #fff; }
.pod-colour.colour-r span { background: #d3202a; color: #fff; }
.pod-colour.colour-g span { background: #00733e; color: #fff; }

.pod-colour.selected {
  border-color: var(--accent);
  background: var(--surface-1);
  color: var(--text);
}

.review-list {
  display: grid;
  margin-top: 8px;
  border-top: 1px solid var(--border);
}

.review-list div {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(0, 2fr);
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding: 11px 0;
}

.review-list dt {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.review-list dd {
  font-weight: 700;
  text-align: right;
}

.wizard-footer {
  justify-content: space-between;
  border-top: 1px solid var(--border);
}

@media (max-width: 599px) {
  .setup-dialog {
    width: 100vw;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }

  .wizard-content {
    min-height: 0;
    flex: 1;
    padding: 30px 20px;
  }

  .choice-list-two,
  .choice-list-three {
    grid-template-columns: 1fr;
  }

  .pod-colours {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .wizard-header,
  .wizard-footer {
    padding-inline: 14px;
  }
}
</style>
