<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { LoaderCircle } from "lucide-vue-next";
import DeckTextInput from "../components/deck/DeckTextInput.vue";
import ModeToggle from "../components/shared/ModeToggle.vue";
import { lookupNameForCardName, useDeckStore } from "../stores/deck";
import { useCardDataStore } from "../stores/cardData";
import { useAnalysisStore } from "../stores/analysis";
import { useSettingsStore } from "../stores/settings";
import type { DeckSnapshot } from "../domain/types";
import { SECURITY_LIMITS } from "../security/limits";
import { APP_STORAGE_KEYS, removeStorageKey } from "../security/storage";
import { validateSavedDecks } from "../security/validation";

const router = useRouter();
const { t } = useI18n();
const deckStore = useDeckStore();
const cardDataStore = useCardDataStore();
const analysisStore = useAnalysisStore();
const settingsStore = useSettingsStore();

const rawText = ref(deckStore.rawText);
const importError = ref("");
const hasReviewed = ref(Boolean(deckStore.parsed));
const manualCommanderNames = ref<string[]>(deckStore.parsed?.commanderEntries.map((e) => e.name) ?? []);
const showAllUnresolved = ref(false);
const savedDecks = ref<DeckSnapshot[]>(loadSavedDecks());
const selectedSnapshotId = ref(savedDecks.value[0]?.id ?? "");

const parsed = computed(() => deckStore.parsed);
const parsedEntries = computed(() => parsed.value?.entries ?? []);
const commanderEntries = computed(() => parsed.value?.commanderEntries ?? []);
const deckEntries = computed(() => parsed.value?.deckEntries ?? []);
const parseErrors = computed(() => parsed.value?.errors ?? []);
const duplicateNames = computed(() => parsed.value?.duplicateNames ?? []);
const detectedSections = computed(() => parsed.value?.sections ?? []);
const hasParsedDeck = computed(() => parsedEntries.value.length > 0);
const commanderKnown = computed(() => commanderEntries.value.length > 0);
const hasBlockingParseIssue = computed(() => !rawText.value.trim() || !hasParsedDeck.value);
const canFetchCardData = computed(
  () => hasReviewed.value && hasParsedDeck.value && parseErrors.value.length === 0,
);
const canRunAnalysis = computed(
  () =>
    commanderKnown.value &&
    (cardDataStore.resolutionStatus === "ready" || cardDataStore.resolutionStatus === "degraded"),
);
const visibleUnresolved = computed(() =>
  showAllUnresolved.value ? cardDataStore.unresolved : cardDataStore.unresolved.slice(0, 12),
);
const unresolvedInvestigations = computed(() =>
  visibleUnresolved.value.map((name) => {
    const entry = parsedEntries.value.find((entry) => entry.name === name);
    return {
      name,
      quantity: entry?.quantity ?? 1,
      source: entry?.isCommander ? "Commander" : "Deck",
      lookupName: entry?.lookupName ?? lookupNameForCardName(name),
      originalName: entry?.originalName ?? name,
      reason: unresolvedReason(name),
      searchUrl: `https://scryfall.com/search?q=${encodeURIComponent(`!"${entry?.lookupName ?? name}"`)}`,
    };
  }),
);
const actionReason = computed(() => {
  if (!rawText.value.trim()) return "Paste a decklist to start.";
  if (!hasParsedDeck.value && hasReviewed.value) return "No card entries were parsed.";
  if (parseErrors.value.length > 0) return "Fix parse errors before fetching card data.";
  if (!commanderKnown.value && hasParsedDeck.value) return "Choose one or two commanders.";
  if (cardDataStore.resolutionStatus === "idle" && canFetchCardData.value) return "Ready to fetch card data.";
  if (cardDataStore.resolutionStatus === "failed") return "Scryfall failed; retry or continue degraded.";
  if (!cardDataStore.resolutionStatus || cardDataStore.resolutionStatus === "idle") return "Review decklist first.";
  if (!canRunAnalysis.value) return "Resolve card data before analysis.";
  return cardDataStore.isDegraded
    ? "Ready for degraded analysis with unresolved cards."
    : "Ready to run analysis.";
});
const liveStatus = computed(() => {
  if (cardDataStore.isLoading) {
    return t("import.loading.title");
  }
  if (analysisStore.isAnalysing) return "Running analysis.";
  return actionReason.value;
});
watch(rawText, (text) => {
  deckStore.setRawText(text);
  hasReviewed.value = Boolean(text.trim());
  importError.value = "";
  cardDataStore.clear();
  analysisStore.clearAll();
  deckStore.clearPreparedData();
});

function reviewDecklist() {
  importError.value = "";
  if (!rawText.value.trim()) return;

  deckStore.setRawText(rawText.value);
  const parsed = deckStore.parsed!;

  if (parsed.entries.length === 0) {
    importError.value = "No card entries found. Check the format.";
    return;
  }
  hasReviewed.value = true;
}

async function fetchCardData() {
  importError.value = "";
  reviewDecklist();
  if (!deckStore.parsed || deckStore.parsed.entries.length === 0 || parseErrors.value.length > 0) {
    if (parseErrors.value.length > 0) {
      importError.value = "Fix parse errors before fetching card data.";
    }
    return;
  }

  await cardDataStore.resolveCards(deckStore.parsed.entries);
  prepareDeckCards();
}

function useCachedOrStubData() {
  if (!deckStore.parsed) return;
  cardDataStore.continueWithStubRecords(deckStore.parsed.entries);
  prepareDeckCards();
}

async function retryFetch() {
  if (!deckStore.parsed) return;
  await fetchCardData();
}

async function retryUnresolvedAsLookup(name: string) {
  if (!deckStore.parsed) return;
  const originalEntry = deckStore.parsed.entries.find((entry) => entry.name === name);
  const lookupName = originalEntry?.lookupName ?? lookupNameForCardName(name);
  const entries = deckStore.parsed.entries.map((entry) =>
    entry.name === name ? { ...entry, name: lookupName } : entry,
  );
  await cardDataStore.resolveCards(entries);
  const resolvedLookup = cardDataStore.cardRecords.get(lookupName);
  if (resolvedLookup) {
    cardDataStore.cardRecords.set(name, { ...resolvedLookup, quantity: originalEntry?.quantity ?? 1 });
  }
  prepareDeckCards();
}

async function clearCacheAndRetry() {
  cardDataStore.clearCacheAndState();
  await fetchCardData();
}

function prepareDeckCards() {
  const currentParsed = deckStore.parsed;
  if (!currentParsed) return;
  const cards = currentParsed.entries.map((entry) => {
    const rec = cardDataStore.cardRecords.get(entry.name);
    return (
      rec ?? {
        name: entry.name,
        typeLine: "",
        colourIdentity: [],
        cmc: 0,
        quantity: entry.quantity,
        isCommander: entry.isCommander,
      }
    );
  });
  deckStore.setCards(cards);
  deckStore.autoResolveCommander();
}

async function runAnalysis() {
  importError.value = "";
  if (!commanderKnown.value) {
    importError.value = "Choose a commander before running analysis.";
    return;
  }
  prepareDeckCards();
  if (!deckStore.commanderInfo) {
    importError.value = "Choose a commander before running analysis.";
    return;
  }
  if (analysisStore.targets.length === 0) {
    const detected = analysisStore.autoDetectTargets(deckStore.cards);
    analysisStore.setTargets(detected);
  }
  await analysisStore.analyse();
  router.push("/analysis");
}

function selectCommander(e: Event) {
  const input = e.target as HTMLInputElement;
  const next = new Set(manualCommanderNames.value);
  if (input.checked) next.add(input.value);
  else next.delete(input.value);
  manualCommanderNames.value = [...next].slice(0, 2);
  deckStore.setCommanderEntries(manualCommanderNames.value);
  prepareDeckCards();
}

function unresolvedReason(name: string): string {
  if (cardDataStore.resolutionStatus === "failed") return "Scryfall request failed before lookup completed";
  if (duplicateNames.value.includes(name)) return "Duplicate parsed name; check quantities/sections";
  if (/[{}()[\]*]/.test(name)) return "Name includes markup or annotation characters";
  if (/[’“”]/.test(name)) return "Name uses smart punctuation; try plain apostrophes/quotes";
  if (/\s{2,}/.test(name)) return "Name has extra whitespace";
  if (!name.includes(" // ")) {
    return "Possibly an MDFC or split-card face name; try the full Scryfall name with //";
  }
  return "Not returned by Scryfall collection lookup; verify exact card name or release availability";
}

async function copyUnresolvedNames() {
  const text = cardDataStore.unresolved.join("\n");
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard can be unavailable in some browser contexts; the table remains selectable.
  }
}

async function copyNormalizedUnresolvedNames() {
  const text = unresolvedInvestigations.value.map((item) => item.lookupName).join("\n");
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard can be unavailable in some browser contexts; the table remains selectable.
  }
}

function loadSavedDecks(): DeckSnapshot[] {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEYS.savedDecks);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const decks = validateSavedDecks(parsed);
    if (!decks) {
      removeStorageKey(APP_STORAGE_KEYS.savedDecks);
      return [];
    }
    if (Array.isArray(parsed) && decks.length !== Math.min(parsed.length, SECURITY_LIMITS.savedDecks)) {
      removeStorageKey(APP_STORAGE_KEYS.savedDecks);
      return [];
    }
    return decks;
  } catch {
    removeStorageKey(APP_STORAGE_KEYS.savedDecks);
    return [];
  }
}

function persistSavedDecks() {
  try {
    localStorage.setItem(
      APP_STORAGE_KEYS.savedDecks,
      JSON.stringify(savedDecks.value.slice(0, SECURITY_LIMITS.savedDecks)),
    );
  } catch {
    importError.value = t("import.storageUnavailable");
  }
}

function saveCurrentDeck() {
  if (!rawText.value.trim()) return;
  const now = Date.now();
  const name =
    window.prompt("Deck name", deckStore.deckName || deckStore.commanderInfo?.names.join(" / ") || "Untitled Deck") ??
    "";
  const trimmed = name.trim();
  if (!trimmed) return;
  if (trimmed.length > SECURITY_LIMITS.savedDeckNameCharacters) {
    importError.value = t("import.deckNameTooLong", {
      max: SECURITY_LIMITS.savedDeckNameCharacters,
    });
    return;
  }
  const existing = savedDecks.value.find((deck) => deck.name.toLowerCase() === trimmed.toLowerCase());
  const snapshot: DeckSnapshot = {
    id: existing?.id ?? `deck-${now}`,
    name: trimmed,
    rawText: rawText.value,
    commanderNames: commanderEntries.value.map((entry) => entry.name),
    settings: { ...settingsStore.settings },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  savedDecks.value = [snapshot, ...savedDecks.value.filter((deck) => deck.id !== snapshot.id)].slice(
    0,
    SECURITY_LIMITS.savedDecks,
  );
  selectedSnapshotId.value = snapshot.id;
  persistSavedDecks();
}

function loadSelectedDeck() {
  const snapshot = savedDecks.value.find((deck) => deck.id === selectedSnapshotId.value);
  if (!snapshot) return;
  rawText.value = snapshot.rawText;
  deckStore.deckName = snapshot.name;
  deckStore.setRawText(snapshot.rawText);
  manualCommanderNames.value = snapshot.commanderNames;
  deckStore.setCommanderEntries(snapshot.commanderNames);
  settingsStore.applySettings(snapshot.settings);
  cardDataStore.clear();
  analysisStore.clearAll();
  hasReviewed.value = true;
}

function deleteSelectedDeck() {
  if (!selectedSnapshotId.value) return;
  savedDecks.value = savedDecks.value.filter((deck) => deck.id !== selectedSnapshotId.value);
  selectedSnapshotId.value = savedDecks.value[0]?.id ?? "";
  persistSavedDecks();
}

const mode = computed({
  get: () => settingsStore.settings.mode,
  set: (val) => settingsStore.setMode(val),
});

const iterationOptions = computed(() => [
  { title: t("settings.veryFast"), value: 10000 },
  { title: t("settings.recommended"), value: 50000 },
  { title: t("settings.accurate"), value: 100000 },
  { title: t("settings.veryAccurate"), value: 200000 },
]);

function setThresholdFromEvent(e: Event) {
  settingsStore.setThreshold(Number((e.target as HTMLInputElement).value));
}

function setIterationsFromEvent(e: Event) {
  settingsStore.setSimulationIterations(Number((e.target as HTMLSelectElement).value));
}

const SAMPLE_DECK = `// Commander
1 Muldrotha, the Gravetide

// Lands
1 Command Tower
1 Exotic Orchard
1 City of Brass
1 Mana Confluence
1 Breeding Pool
1 Watery Grave
1 Overgrown Tomb
1 Zagoth Triome
1 Underground River
1 Llanowar Wastes
1 Yavimaya Coast
1 Drowned Catacomb
1 Hinterland Harbor
1 Woodland Cemetery
1 Darkslick Shores
1 Blooming Marsh
1 Botanical Sanctum
1 Shipwreck Marsh
1 Deathcap Glade
1 Dreamroot Cascade
1 Polluted Delta
1 Misty Rainforest
1 Verdant Catacombs
1 Marsh Flats
1 Fabled Passage
1 Bojuka Bog
1 Boseiju, Who Endures
1 Otawara, Soaring City
1 Takenuma, Abandoned Mire
4 Forest
2 Island
2 Swamp

// Rocks & Ramp
1 Sol Ring
1 Arcane Signet
1 Dimir Signet
1 Golgari Signet
1 Simic Signet
1 Fellwar Stone
1 Talisman of Curiosity
1 Nature's Lore
1 Three Visits
1 Cultivate

// Spells
1 Counterspell
1 Swan Song
1 Mana Drain
1 Force of Will
1 Pact of Negation
1 Cyclonic Rift
1 Windfall
1 Reanimate
1 Animate Dead
1 Dance of the Dead
1 Life from the Loam
1 Crop Rotation
1 Demonic Tutor
1 Vampiric Tutor
1 Mystical Tutor
1 Entomb
1 Buried Alive
1 Survival of the Fittest
1 Sylvan Library
1 Pernicious Deed
1 Aura Shards
1 Phantasmal Image
1 Glen Elendra Archmage
1 Eternal Witness
1 Reclamation Sage
1 Wood Elves
1 Fierce Guardianship
1 Mana Crypt
1 Chrome Mox
1 Lotus Petal
1 Phyrexian Tower
1 Academy Ruins
1 Strip Mine
1 Wasteland
1 Cabal Coffers
1 Urborg, Tomb of Yawgmoth
1 Tropical Island
1 Underground Sea
1 Bayou
1 Reflecting Pool
1 Misty Rainforest`;
</script>

<template>
  <div class="page-container" :aria-busy="cardDataStore.isLoading">
    <Teleport to="body">
      <div
        v-if="cardDataStore.isLoading"
        class="card-loading-overlay"
        role="status"
        :aria-label="t('import.loading.title')"
        aria-live="polite"
        aria-atomic="true"
      >
        <div class="card-loading-panel">
          <LoaderCircle class="card-loading-spinner" :size="30" aria-hidden="true" />
        </div>
      </div>
    </Teleport>

    <section class="card card-tonal card-pad mb-6">
      <h1 class="page-title">{{ t("import.title") }}</h1>
      <p class="sr-only" aria-live="polite">{{ liveStatus }}</p>
    </section>

    <div class="import-grid">
      <div class="card card-pad">
          <h2 class="panel-title">{{ t("import.decklist") }}</h2>
          <div class="mt-5 flex flex-col gap-4">
            <DeckTextInput
              v-model="rawText"
              :disabled="cardDataStore.isLoading"
              :action-label="t('deckInput.review')"
              :show-action="false"
              @import="reviewDecklist"
            />

            <section v-if="hasReviewed" class="review-panel">
              <div class="review-head">
                <h3>{{ t("import.review") }}</h3>
                <span class="review-status" :class="{ ok: hasParsedDeck && parseErrors.length === 0 }">
                  {{ hasParsedDeck ? t("import.parsed") : t("import.needsDecklist") }}
                </span>
              </div>

              <div class="fact-grid">
                <div class="fact">
                  <span class="fact-label">{{ t("import.parsedEntries") }}</span>
                  <strong>{{ parsedEntries.length }}</strong>
                </div>
                <div class="fact">
                  <span class="fact-label">{{ t("import.selectedCommanders") }}</span>
                  <strong>{{ commanderEntries.length }}</strong>
                </div>
                <div class="fact">
                  <span class="fact-label">{{ t("import.mainDeckEntries") }}</span>
                  <strong>{{ deckEntries.length }}</strong>
                </div>
                <div class="fact">
                  <span class="fact-label">{{ t("import.duplicates") }}</span>
                  <strong>{{ duplicateNames.length }}</strong>
                </div>
              </div>

              <div v-if="detectedSections.length > 0" class="review-line">
                <span class="field-label">{{ t("import.detectedSections") }}</span>
                <div class="chip-list">
                  <span v-for="section in detectedSections" :key="section" class="chip">
                    {{ section }}
                  </span>
                </div>
              </div>

              <div v-if="duplicateNames.length > 0" class="alert alert-warning">
                Duplicate names detected: {{ duplicateNames.join(", ") }}
              </div>

              <div v-if="parseErrors.length > 0" class="alert alert-error">
                <strong>Parse errors</strong>
                <ul class="issue-list">
                  <li v-for="err in parseErrors" :key="err">{{ err }}</li>
                </ul>
              </div>

              <div v-if="hasParsedDeck" class="manual-commander">
                <span class="field-label">{{ t("import.commanderSelection") }}</span>
                <div class="commander-choice-list">
                  <label v-for="entry in parsedEntries" :key="entry.name" class="commander-choice">
                    <input
                      type="checkbox"
                      :value="entry.name"
                      :checked="commanderEntries.some((cmd) => cmd.name === entry.name)"
                      :disabled="
                        !commanderEntries.some((cmd) => cmd.name === entry.name) &&
                        commanderEntries.length >= 2
                      "
                      @change="selectCommander"
                    />
                    <span>{{ entry.name }}</span>
                  </label>
                </div>
              </div>
            </section>

            <div v-if="importError" class="alert alert-error">
              {{ importError }}
            </div>

            <div v-if="cardDataStore.loadError" class="alert alert-warning">
              {{ cardDataStore.loadError }}
            </div>

            <section v-if="cardDataStore.resolutionStatus !== 'idle'" class="review-panel">
              <div class="review-head">
                <h3>{{ t("import.cardData") }}</h3>
                <span class="review-status" :class="{ ok: cardDataStore.resolutionStatus === 'ready' }">
                  {{ cardDataStore.resolutionStatus }}
                </span>
              </div>
              <div class="fact-grid">
                <div class="fact">
                  <span class="fact-label">{{ t("import.cached") }}</span>
                  <strong>{{ cardDataStore.cachedCount }}</strong>
                </div>
                <div class="fact">
                  <span class="fact-label">{{ t("import.requested") }}</span>
                  <strong>{{ cardDataStore.requestedCount }}</strong>
                </div>
                <div class="fact">
                  <span class="fact-label">{{ t("import.resolved") }}</span>
                  <strong>{{ cardDataStore.resolvedCount }}</strong>
                </div>
                <div class="fact">
                  <span class="fact-label">{{ t("import.unresolved") }}</span>
                  <strong>{{ cardDataStore.unresolvedCount }}</strong>
                </div>
              </div>
              <div v-if="cardDataStore.unresolved.length > 0" class="review-line">
                <div class="unresolved-head">
                  <span class="field-label">Unresolved cards for investigation</span>
                  <button type="button" class="inline-action" @click="copyUnresolvedNames">
                    Copy names
                  </button>
                  <button type="button" class="inline-action" @click="copyNormalizedUnresolvedNames">
                    Copy normalized
                  </button>
                </div>
                <div class="unresolved-table-wrap">
                  <table class="unresolved-table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Name</th>
                        <th>Lookup</th>
                        <th>Source</th>
                        <th>Likely reason</th>
                        <th>Check</th>
                        <th>Retry</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in unresolvedInvestigations" :key="item.name">
                        <td>{{ item.quantity }}</td>
                        <td class="unresolved-name">{{ item.name }}</td>
                        <td>{{ item.lookupName }}</td>
                        <td>{{ item.source }}</td>
                        <td>{{ item.reason }}</td>
                        <td>
                          <a :href="item.searchUrl" target="_blank" rel="noopener noreferrer">
                            Scryfall
                          </a>
                        </td>
                        <td>
                          <button
                            type="button"
                            class="inline-action"
                            @click="retryUnresolvedAsLookup(item.name)"
                          >
                            Retry
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="unknown-list">
                  Showing {{ visibleUnresolved.length }} of {{ cardDataStore.unresolved.length }}
                  unresolved cards.
                </p>
                <button
                  v-if="cardDataStore.unresolved.length > 12"
                  type="button"
                  class="inline-action"
                  @click="showAllUnresolved = !showAllUnresolved"
                >
                  {{ showAllUnresolved ? "Show fewer" : `Show ${cardDataStore.unresolved.length - 12} more` }}
                </button>
              </div>
            </section>

          </div>
      </div>

      <aside class="card card-pad controls-card">
          <h2 class="panel-title">{{ t("import.flow") }}</h2>
          <div class="mt-5 flex flex-col gap-6">
            <div class="flow-steps">
              <div class="flow-step" :class="{ active: !hasReviewed }">{{ t("import.pasteStep") }}</div>
              <div class="flow-step" :class="{ active: hasReviewed && cardDataStore.resolutionStatus === 'idle' }">{{ t("import.reviewStep") }}</div>
              <div class="flow-step" :class="{ active: cardDataStore.resolutionStatus !== 'idle' }">{{ t("import.analyseStep") }}</div>
            </div>

            <div class="flow-actions">
              <button
                v-if="!hasReviewed || hasBlockingParseIssue || parseErrors.length > 0"
                type="button"
                class="btn btn-primary w-full"
                :disabled="!rawText.trim()"
                @click="reviewDecklist"
              >
                {{ t("deckInput.review") }}
              </button>

              <button
                v-else-if="cardDataStore.resolutionStatus === 'idle'"
                type="button"
                class="btn btn-primary w-full"
                :disabled="!canFetchCardData || cardDataStore.isLoading"
                @click="fetchCardData"
              >
                {{ t("import.fetch") }}
              </button>

              <template v-else-if="cardDataStore.resolutionStatus === 'failed'">
                <button
                  type="button"
                  class="btn btn-primary w-full"
                  :disabled="cardDataStore.isLoading"
                  @click="retryFetch"
                >
                  {{ t("import.retryFetch") }}
                </button>
                <button type="button" class="btn btn-tonal w-full" @click="useCachedOrStubData">
                  {{ t("import.useCached") }}
                </button>
                <button type="button" class="btn btn-ghost w-full" @click="cardDataStore.clear()">
                  {{ t("import.editDecklist") }}
                </button>
              </template>

              <button
                v-else
                type="button"
                class="btn btn-primary w-full"
                :disabled="!canRunAnalysis || analysisStore.isAnalysing"
                @click="runAnalysis"
              >
                {{ analysisStore.isAnalysing ? t("import.running") : t("import.run") }}
              </button>

              <button
                v-if="hasReviewed && cardDataStore.resolutionStatus !== 'idle'"
                type="button"
                class="btn btn-ghost w-full"
                @click="clearCacheAndRetry"
              >
                {{ t("import.clearCache") }}
              </button>
            </div>

            <p class="sr-only" aria-live="polite">{{ actionReason }}</p>

            <div v-if="!commanderKnown && hasParsedDeck" class="alert alert-warning">
              {{ t("import.chooseCommander") }}
            </div>

            <div v-if="cardDataStore.isDegraded" class="alert alert-warning">
              {{ t("import.degraded") }}
            </div>

            <div class="flex flex-col gap-3">
              <div class="field-label">
                {{ t("modes.label") }}
              </div>
              <ModeToggle v-model="mode" />
            </div>

            <div class="flex flex-col gap-3">
              <div class="field-label">{{ t("import.savedDecks") }}</div>
              <button type="button" class="btn btn-tonal w-full" :disabled="!rawText.trim()" @click="saveCurrentDeck">
                {{ t("import.saveDeck") }}
              </button>
              <select v-model="selectedSnapshotId" class="field" :disabled="savedDecks.length === 0">
                <option value="">{{ t("import.noSavedDeck") }}</option>
                <option v-for="deck in savedDecks" :key="deck.id" :value="deck.id">
                  {{ deck.name }}
                </option>
              </select>
              <div class="flow-actions">
                <button
                  type="button"
                  class="btn btn-tonal w-full"
                  :disabled="!selectedSnapshotId"
                  @click="loadSelectedDeck"
                >
                  {{ t("import.loadDeck") }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost w-full"
                  :disabled="!selectedSnapshotId"
                  @click="deleteSelectedDeck"
                >
                  {{ t("import.deleteDeck") }}
                </button>
              </div>
            </div>

            <div class="flex flex-col gap-3">
              <div class="field-label">
                {{ t("import.assumptions") }}
              </div>
              <label class="switch-row">
                <input v-model="settingsStore.settings.countTaplandsTurnTwo" class="peer sr-only" type="checkbox" />
                <span class="switch" />
                <span>{{ t("import.countTaplands") }}</span>
              </label>
              <label class="switch-row">
                <input v-model="settingsStore.settings.countMDFCsAsLands" class="peer sr-only" type="checkbox" />
                <span class="switch" />
                <span>{{ t("import.countMdfcs") }}</span>
              </label>
              <label class="switch-row">
                <input v-model="settingsStore.settings.countOrchardAsThreeQuarter" class="peer sr-only" type="checkbox" />
                <span class="switch" />
                <span>{{ t("import.orchard") }}</span>
              </label>
              <label class="switch-row">
                <input v-model="settingsStore.settings.countFellwarAsHalf" class="peer sr-only" type="checkbox" />
                <span class="switch" />
                <span>{{ t("import.fellwar") }}</span>
              </label>
            </div>

            <div class="flex flex-col gap-3">
              <div class="field-label">
                {{ t("import.threshold") }}
              </div>
              <input
                class="range"
                type="range"
                :value="settingsStore.settings.targetThreshold"
                min="0.5"
                max="0.99"
                step="0.01"
                @input="setThresholdFromEvent"
              />
              <div class="text-xs text-[var(--text-muted)]">
                {{ Math.round(settingsStore.settings.targetThreshold * 100) }}%
              </div>
            </div>

            <div v-if="mode === 'exact'" class="flex flex-col gap-3">
              <div class="field-label">
                {{ t("import.iterations") }}
              </div>
              <select
                class="field"
                :value="settingsStore.settings.simulationIterations"
                @change="setIterationsFromEvent"
              >
                <option v-for="option in iterationOptions" :key="option.value" :value="option.value">
                  {{ option.title }}
                </option>
              </select>
            </div>

            <button type="button" class="btn btn-tonal w-full" @click="rawText = SAMPLE_DECK">
              {{ t("import.sample") }}
            </button>
          </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.card-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--background) 84%, transparent);
}

.card-loading-panel {
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--surface-0);
  box-shadow: var(--shadow-elevated);
}

.card-loading-spinner {
  color: var(--accent);
  animation: card-loading-spin 900ms linear infinite;
}

@keyframes card-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.import-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  gap: 28px;
  align-items: start;
}

.controls-card {
  position: sticky;
  top: 84px;
}

.review-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 16px;
  background: transparent;
}

.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.review-head h3 {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
}

.review-status {
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 2px 7px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.review-status.ok {
  border-color: var(--success);
  color: var(--success);
}

.fact-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: 0;
  overflow: hidden;
}

.fact {
  padding: 10px;
  border-left: 1px solid var(--border);
  background: transparent;
}

.fact:first-child {
  border-left: 0;
}

.fact-label {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.fact strong {
  font-family: var(--font-mono);
  font-size: 17px;
}

.review-line {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.issue-list {
  margin: 6px 0 0 18px;
  color: inherit;
}

.manual-commander {
  display: block;
}

.commander-choice-list {
  display: grid;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.commander-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}

.commander-choice:first-child {
  border-top: 0;
}

.commander-choice:has(input:checked) {
  background: var(--surface-1);
  box-shadow: inset 3px 0 0 var(--accent);
  color: var(--text);
}

.commander-choice input:disabled + span {
  opacity: 0.45;
}

.unknown-list {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.unresolved-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.unresolved-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.unresolved-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.unresolved-table th,
.unresolved-table td {
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.unresolved-table th {
  border-top: 0;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.unresolved-name {
  color: var(--text);
  font-weight: 700;
  white-space: nowrap;
}

.inline-action {
  width: fit-content;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.resolution-summary,
.action-reason {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.flow-steps {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  border-top: 1px solid var(--border);
}

.flow-step {
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
  padding: 10px 11px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.flow-step.active {
  border-left-color: var(--accent);
  color: var(--text);
  background: var(--surface-1);
}

.flow-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  font-size: 13px;
}

.range {
  width: 100%;
  accent-color: var(--accent);
}

@media (max-width: 1024px) {
  .import-grid {
    grid-template-columns: 1fr;
  }

  .controls-card {
    position: static;
  }
}

@media (max-width: 640px) {
  .card-loading-overlay {
    padding: 12px;
  }

  .fact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .fact:nth-child(odd) {
    border-left: 0;
  }

  .fact:nth-child(n + 3) {
    border-top: 1px solid var(--border);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-loading-spinner {
    animation: none;
  }
}
</style>
