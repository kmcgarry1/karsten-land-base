import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { CardRecord, ManaSourceProfile, ScryfallCard } from "../domain/types";
import {
  batchFetchCards,
  clearScryfallCache,
  countCachedCards,
  scryfallToCardRecord,
} from "../services/scryfall";
import { classifyCard } from "../services/classifier";

export type ResolutionStatus =
  | "idle"
  | "parsing"
  | "cache-check"
  | "fetching"
  | "classifying"
  | "ready"
  | "degraded"
  | "failed";

export const useCardDataStore = defineStore("cardData", () => {
  // All resolved card records (name → CardRecord)
  const cardRecords = ref<Map<string, CardRecord>>(new Map());

  // Mana source profiles (name → ManaSourceProfile)
  const sourceProfiles = ref<Map<string, ManaSourceProfile>>(new Map());

  // Cards that failed to resolve
  const unresolved = ref<string[]>([]);
  const loadError = ref("");
  const resolutionStatus = ref<ResolutionStatus>("idle");
  const cachedCount = ref(0);
  const requestedCount = ref(0);
  const resolvedCount = ref(0);
  const lastResolutionAt = ref<number | null>(null);
  const unresolvedCount = computed(() => unresolved.value.length);
  const canRetry = computed(() => resolutionStatus.value === "failed" || loadError.value.length > 0);
  const isDegraded = computed(
    () => resolutionStatus.value === "degraded" || resolutionStatus.value === "failed",
  );

  const loadProgress = ref(0); // 0–1
  const isLoading = ref(false);

  const allProfiles = computed(() => Array.from(sourceProfiles.value.values()));

  const profilesWithQuantity = computed(() => {
    const result: Record<string, ManaSourceProfile & { quantity: number }> = {};
    for (const [name, profile] of sourceProfiles.value) {
      const card = cardRecords.value.get(name);
      result[name] = { ...profile, quantity: card?.quantity ?? 1 };
    }
    return result;
  });

  /**
   * Resolve a list of card names (from a parsed decklist) via Scryfall,
   * then classify each as a mana source profile.
   */
  async function resolveCards(
    entries: Array<{ name: string; quantity: number; isCommander?: boolean }>,
  ): Promise<void> {
    isLoading.value = true;
    loadProgress.value = 0;
    unresolved.value = [];
    loadError.value = "";
    cachedCount.value = 0;
    requestedCount.value = 0;
    resolvedCount.value = 0;
    resolutionStatus.value = "cache-check";

    try {
      const names = [...new Set(entries.map((e) => e.name))];
      if (names.length === 0) {
        resolutionStatus.value = "idle";
        return;
      }

      cachedCount.value = countCachedCards(names);
      requestedCount.value = names.length - cachedCount.value;
      resolutionStatus.value = requestedCount.value > 0 ? "fetching" : "classifying";

      const scryfallData = await batchFetchCards(names, (done, total) => {
        loadProgress.value = done / total;
      });

      if (names.length > 0 && scryfallData.size === 0) {
        loadError.value =
          "Scryfall did not return card data. This is usually a temporary rate limit or service outage; wait a minute and try again.";
      }

      resolutionStatus.value = "classifying";
      cardRecords.value.clear();
      sourceProfiles.value.clear();

      const resolvedEntries = applyResolvedCards(entries, scryfallData);
      resolvedCount.value = resolvedEntries;
      resolutionStatus.value =
        unresolved.value.length === 0 ? "ready" : scryfallData.size === 0 ? "failed" : "degraded";
      lastResolutionAt.value = Date.now();
    } finally {
      loadProgress.value = 1;
      isLoading.value = false;
    }
  }

  function continueWithStubRecords(
    entries: Array<{ name: string; quantity: number; isCommander?: boolean }>,
  ) {
    unresolved.value = [];
    for (const entry of entries) {
      if (!cardRecords.value.has(entry.name)) {
        cardRecords.value.set(entry.name, createStubRecord(entry));
      }
      const record = cardRecords.value.get(entry.name);
      if (!record?.typeLine) unresolved.value.push(entry.name);
    }
    resolvedCount.value = cardRecords.value.size - unresolved.value.length;
    resolutionStatus.value = unresolved.value.length > 0 ? "degraded" : "ready";
    lastResolutionAt.value = Date.now();
    loadError.value = unresolved.value.length
      ? "Continuing with unresolved cards as unknown stubs. Analysis may be incomplete."
      : "";
    loadProgress.value = 1;
    isLoading.value = false;
  }

  function applyResolvedCards(
    entries: Array<{ name: string; quantity: number; isCommander?: boolean }>,
    scryfallData: Map<string, ScryfallCard>,
  ): number {
    let resolvedEntries = 0;
    for (const entry of entries) {
      const scryfall = scryfallData.get(entry.name) as ScryfallCard | undefined;
      if (!scryfall) {
        unresolved.value.push(entry.name);
        cardRecords.value.set(entry.name, createStubRecord(entry));
        continue;
      }

      const record = scryfallToCardRecord(scryfall, entry.quantity);
      record.isCommander = entry.isCommander;
      cardRecords.value.set(entry.name, record);
      resolvedEntries++;

      const profile = classifyCard(scryfall);
      if (profile) {
        sourceProfiles.value.set(entry.name, profile);
      }
    }
    return resolvedEntries;
  }

  function createStubRecord(entry: {
    name: string;
    quantity: number;
    isCommander?: boolean;
  }): CardRecord {
    return {
      name: entry.name,
      typeLine: "",
      colourIdentity: [],
      cmc: 0,
      quantity: entry.quantity,
      isCommander: entry.isCommander,
    };
  }

  /** Manually override a card's source profile (for user corrections). */
  function overrideProfile(name: string, profile: ManaSourceProfile) {
    sourceProfiles.value.set(name, profile);
  }

  function clear() {
    cardRecords.value.clear();
    sourceProfiles.value.clear();
    unresolved.value = [];
    loadError.value = "";
    loadProgress.value = 0;
    resolutionStatus.value = "idle";
    cachedCount.value = 0;
    requestedCount.value = 0;
    resolvedCount.value = 0;
    lastResolutionAt.value = null;
  }

  function clearCacheAndState() {
    clearScryfallCache();
    clear();
  }

  return {
    cardRecords,
    sourceProfiles,
    unresolved,
    loadError,
    resolutionStatus,
    cachedCount,
    requestedCount,
    resolvedCount,
    lastResolutionAt,
    unresolvedCount,
    canRetry,
    isDegraded,
    loadProgress,
    isLoading,
    allProfiles,
    profilesWithQuantity,
    resolveCards,
    continueWithStubRecords,
    overrideProfile,
    clear,
    clearCacheAndState,
  };
});
