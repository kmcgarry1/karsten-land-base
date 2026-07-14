import { APP_STORAGE_KEYS, CARD_CACHE_PREFIX, removeStorageKey } from "../security/storage";

export const ONBOARDING_STORAGE_KEY = APP_STORAGE_KEYS.onboarding;
export const ONBOARDING_VERSION = "1";

const LEGACY_STORAGE_KEYS = new Set<string>([APP_STORAGE_KEYS.settings, APP_STORAGE_KEYS.savedDecks]);

export function hasLegacyAppData(): boolean {
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (LEGACY_STORAGE_KEYS.has(key) || key.startsWith(CARD_CACHE_PREFIX))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION);
  } catch {
    // The current session can continue when storage is unavailable.
  }
}

export function shouldShowOnboarding(): boolean {
  try {
    const marker = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (marker === ONBOARDING_VERSION) return false;
    if (marker !== null) removeStorageKey(ONBOARDING_STORAGE_KEY);
    if (hasLegacyAppData()) {
      markOnboardingComplete();
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // Test and development helper; storage may be unavailable.
  }
}
