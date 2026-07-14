<script setup lang="ts">
import { ref } from "vue";
import type { Component } from "vue";
import type { SpellTarget, MtgColour } from "../../domain/types";
import { parsePipRequirements } from "../../engines/karsten";
import ManaSymbol from "../shared/ManaSymbol.vue";
import { Target, Check, Clock, X, Plus } from "lucide-vue-next";

defineProps<{
  targets: SpellTarget[];
  commanderIdentity: MtgColour[];
}>();

const emit = defineEmits<{
  add: [target: SpellTarget];
  remove: [id: string];
  update: [id: string, patch: Partial<SpellTarget>];
}>();

const newCardName = ref("");
const newTargetTurn = ref(3);
const newThreshold = ref(0.9);
const newPriority = ref<"must" | "nice" | "late">("nice");

const TURN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const GOAL_OPTIONS = [
  { title: "99%", value: 0.99 },
  { title: "95%", value: 0.95 },
  { title: "90%", value: 0.9 },
  { title: "80%", value: 0.8 },
  { title: "70%", value: 0.7 },
];
const PRIORITY_OPTIONS = [
  { title: "Must hit", value: "must" },
  { title: "Nice on curve", value: "nice" },
  { title: "Late game", value: "late" },
] as const;

function updateTargetTurn(id: string, value: unknown) {
  emit("update", id, { targetTurn: Number(value) });
}

function updateTargetGoal(id: string, value: unknown) {
  emit("update", id, { probabilityThreshold: Number(value) });
}

function updateTargetPriority(id: string, value: unknown) {
  emit("update", id, { priorityTier: value as "must" | "nice" | "late" });
}

function updateTargetTurnFromEvent(id: string, e: Event) {
  updateTargetTurn(id, (e.target as HTMLSelectElement).value);
}

function updateTargetGoalFromEvent(id: string, e: Event) {
  updateTargetGoal(id, (e.target as HTMLSelectElement).value);
}

function updateTargetPriorityFromEvent(id: string, e: Event) {
  updateTargetPriority(id, (e.target as HTMLSelectElement).value);
}

function addTarget() {
  if (!newCardName.value.trim()) return;
  const pips = parsePipRequirements(newCardName.value);
  const target: SpellTarget = {
    id: `manual-${Date.now()}`,
    cardName: newCardName.value.trim(),
    targetTurn: newTargetTurn.value,
    requiredPips: pips,
    totalManaValue: newTargetTurn.value,
    probabilityThreshold: newThreshold.value,
    priorityTier: newPriority.value,
    isAutoDetected: false,
  };
  emit("add", target);
  newCardName.value = "";
}

const PRIORITY_ICONS: Record<string, Component> = {
  must: Target,
  nice: Check,
  late: Clock,
};

const PRIORITY_LABELS: Record<string, string> = {
  must: "Must",
  nice: "Nice",
  late: "Late",
};
</script>

<template>
  <div class="spell-editor">
    <div v-if="targets.length > 0" class="targets-list">
      <template v-for="(target, index) in targets" :key="target.id">
        <div class="target-item">
          <div class="target-head">
            <div class="target-main">
              <span class="target-name">{{ target.cardName }}</span>
              <div class="target-meta">
                <div class="target-pips">
                  <template v-for="(n, c) in target.requiredPips" :key="c">
                    <span v-if="n && n > 0" class="pip-group">
                      <ManaSymbol
                        v-for="i in n as number"
                        :key="i"
                        :symbol="c as string"
                        size="sm"
                      />
                    </span>
                  </template>
                  <span
                    v-if="Object.keys(target.requiredPips).length === 0"
                    class="chip"
                  >
                    No coloured pips
                  </span>
                </div>

                <span
                  class="chip priority-chip"
                  :class="`priority-${target.priorityTier}`"
                >
                  <component :is="PRIORITY_ICONS[target.priorityTier]" :size="11" class="mr-1" />
                  {{ PRIORITY_LABELS[target.priorityTier] }}
                </span>
              </div>
            </div>

            <button
              type="button"
              class="btn btn-ghost btn-icon remove-button"
              aria-label="Remove target"
              @click="emit('remove', target.id)"
            >
              <X :size="16" />
            </button>
          </div>

          <div class="target-controls">
            <label>
              <span class="field-label">Turn</span>
              <select
                class="field"
                :value="target.targetTurn"
                @change="updateTargetTurnFromEvent(target.id, $event)"
              >
                <option v-for="turn in TURN_OPTIONS" :key="turn" :value="turn">{{ turn }}</option>
              </select>
            </label>

            <label>
              <span class="field-label">Goal</span>
              <select
                class="field"
                :value="target.probabilityThreshold"
                @change="updateTargetGoalFromEvent(target.id, $event)"
              >
                <option v-for="goal in GOAL_OPTIONS" :key="goal.value" :value="goal.value">
                  {{ goal.title }}
                </option>
              </select>
            </label>

            <label>
              <span class="field-label">Priority</span>
              <select
                class="field"
                :value="target.priorityTier"
                @change="updateTargetPriorityFromEvent(target.id, $event)"
              >
                <option v-for="priority in PRIORITY_OPTIONS" :key="priority.value" :value="priority.value">
                  {{ priority.title }}
                </option>
              </select>
            </label>
          </div>
        </div>
        <div v-if="index < targets.length - 1" class="divider" />
      </template>
    </div>

    <div v-else class="alert alert-info">
      No target spells added. Auto-detection runs on import.
    </div>

    <div class="add-target-form">
      <div class="add-target-grid">
        <label class="card-name-field">
          <span class="field-label">Card name or mana cost</span>
          <input
            v-model="newCardName"
            placeholder="Card name or mana cost like {2}{U}{U}…"
            class="field"
            @keydown.enter="addTarget"
          />
        </label>
        <label>
          <span class="field-label">Turn</span>
          <select
            v-model.number="newTargetTurn"
            class="field"
          >
            <option v-for="turn in TURN_OPTIONS" :key="turn" :value="turn">{{ turn }}</option>
          </select>
        </label>
        <label>
          <span class="field-label">Goal</span>
          <select
            v-model.number="newThreshold"
            class="field"
          >
            <option v-for="goal in GOAL_OPTIONS" :key="goal.value" :value="goal.value">
              {{ goal.title }}
            </option>
          </select>
        </label>
        <label>
          <span class="field-label">Priority</span>
          <select
            v-model="newPriority"
            class="field"
          >
            <option v-for="priority in PRIORITY_OPTIONS" :key="priority.value" :value="priority.value">
              {{ priority.title }}
            </option>
          </select>
        </label>
        <div class="add-button-wrap">
          <button
            type="button"
            class="btn btn-primary add-target-button"
            :disabled="!newCardName.trim()"
            @click="addTarget"
          >
            <Plus :size="16" class="mr-1" />
            Add
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spell-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.targets-list {
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: transparent;
}

.target-item {
  padding: 12px 14px;
}

.target-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.target-main {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
  min-width: 0;
}

.target-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 14px;
  line-height: 1.25;
  color: var(--text);
}

.target-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.target-pips {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}
.pip-group {
  display: flex;
  gap: 2px;
}

.target-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
  min-width: 0;
}

.add-target-form {
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 2px;
  background: transparent;
}

.add-target-grid {
  display: grid;
  grid-template-columns: minmax(180px, 2fr) repeat(4, minmax(86px, 1fr));
  gap: 10px;
  align-items: end;
}

.card-name-field {
  min-width: 0;
}

.add-button-wrap {
  min-width: 0;
}

.add-target-button {
  width: 100%;
  min-height: 40px;
}

.priority-must {
  border-color: var(--danger);
  background: transparent;
  color: var(--danger);
}

.priority-nice {
  border-color: var(--success);
  background: transparent;
  color: var(--success);
}

.priority-late {
  color: var(--text-muted);
}

.remove-button {
  color: var(--danger);
}

@media (max-width: 599px) {
  .target-item {
    padding: 12px;
  }

  .target-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .add-target-form {
    padding: 10px;
  }

  .add-target-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .card-name-field {
    grid-column: 1 / -1;
  }
}

@media (max-width: 920px) {
  .add-target-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .card-name-field {
    grid-column: 1 / -1;
  }
}
</style>
