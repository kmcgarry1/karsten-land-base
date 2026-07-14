import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  markOnboardingComplete,
  resetOnboarding,
  shouldShowOnboarding,
} from "../index";

function storageMock(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe("first-run onboarding", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storageMock());
  });

  it("shows for a new user and stays hidden after completion", () => {
    expect(shouldShowOnboarding()).toBe(true);
    markOnboardingComplete();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("1");
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("shows again for malformed or outdated completion markers", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "invalid");
    expect(shouldShowOnboarding()).toBe(true);
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "0");
    expect(shouldShowOnboarding()).toBe(true);
  });

  it.each(["clf_settings", "clf_saved_decks", "clf_card_island"])(
    "migrates existing users with %s without showing the wizard",
    (key) => {
      localStorage.setItem(key, "{}");
      expect(shouldShowOnboarding()).toBe(false);
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("1");
    },
  );

  it("does not treat language or theme preferences as prior app usage", () => {
    localStorage.setItem("clf_locale", "en");
    localStorage.setItem("clf_theme", "dark");
    expect(shouldShowOnboarding()).toBe(true);
  });

  it("fails safely when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
    });
    expect(shouldShowOnboarding()).toBe(true);
    expect(() => markOnboardingComplete()).not.toThrow();
    expect(() => resetOnboarding()).not.toThrow();
  });
});
