export const APP_STORAGE_KEYS = Object.freeze({
  settings: "clf_settings",
  savedDecks: "clf_saved_decks",
  locale: "clf_locale",
  theme: "clf_theme",
  onboarding: "clf_onboarding_version",
});

export const APP_STORAGE_PREFIX = "clf_";
export const CARD_CACHE_PREFIX = "clf_card_";

export function removeStorageKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function clearAllApplicationData(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(APP_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // The caller can still reset in-memory state when storage is unavailable.
  }
}

export function clearApplicationDataAndReload(
  reload: () => void = () => window.location.reload(),
): void {
  clearAllApplicationData();
  reload();
}
