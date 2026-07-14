import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY_LIMITS, isDeckTextWithinLimits, simulationLimitError } from "../limits";
import { APP_STORAGE_KEYS, clearAllApplicationData, clearApplicationDataAndReload } from "../storage";
import { safeScryfallImageUrl } from "../urls";
import { validateAnalysisSettings, validateSavedDecks } from "../validation";

describe("security boundaries", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      key: (index: number) => [...data.keys()][index] ?? null,
      removeItem: (key: string) => data.delete(key),
      setItem: (key: string, value: string) => data.set(key, value),
    });
  });

  it("enforces deck and simulation resource limits", () => {
    expect(isDeckTextWithinLimits("1 Island")).toBe(true);
    expect(isDeckTextWithinLimits("x".repeat(SECURITY_LIMITS.deckTextCharacters + 1))).toBe(false);
    expect(simulationLimitError(200_000, 100)).toBeNull();
    expect(simulationLimitError(200_000, 101)).toContain("too large");
  });

  it("only accepts approved Scryfall image origins", () => {
    expect(safeScryfallImageUrl("https://cards.scryfall.io/large/front/a.jpg")).toContain("cards.scryfall.io");
    expect(safeScryfallImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeScryfallImageUrl("https://cards.scryfall.io.evil.test/a.jpg")).toBeUndefined();
    expect(safeScryfallImageUrl("https://user@cards.scryfall.io/a.jpg")).toBeUndefined();
  });

  it("sanitizes settings and saved deck records", () => {
    const settings = validateAnalysisSettings(JSON.parse(JSON.stringify({
      mode: "exact",
      targetThreshold: Number.POSITIVE_INFINITY,
      simulationIterations: 999_999,
      knownPodColours: ["U", "U", "invalid"],
      "__proto__": { polluted: true },
    })));
    expect(settings.mode).toBe("exact");
    expect(settings.targetThreshold).toBe(0.9);
    expect(settings.simulationIterations).toBe(200_000);
    expect(settings.knownPodColours).toEqual(["U"]);

    expect(validateSavedDecks({})).toBeNull();
    expect(validateSavedDecks([{ id: "bad" }])).toEqual([]);
  });

  it("clears only application-owned storage", () => {
    localStorage.setItem(APP_STORAGE_KEYS.settings, "{}");
    localStorage.setItem("clf_card_island", "{}");
    localStorage.setItem("unrelated", "keep");
    clearAllApplicationData();
    expect(localStorage.getItem(APP_STORAGE_KEYS.settings)).toBeNull();
    expect(localStorage.getItem("clf_card_island")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });

  it("reloads after clearing application data", () => {
    const reload = vi.fn<() => void>();
    localStorage.setItem(APP_STORAGE_KEYS.savedDecks, "[]");
    clearApplicationDataAndReload(reload);
    expect(localStorage.getItem(APP_STORAGE_KEYS.savedDecks)).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("survives unavailable browser storage", () => {
    vi.stubGlobal("localStorage", {
      get length() {
        throw new Error("blocked");
      },
    });
    expect(() => clearAllApplicationData()).not.toThrow();
  });
});
