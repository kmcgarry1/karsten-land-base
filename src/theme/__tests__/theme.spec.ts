import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupSystemThemeListener,
  initialThemePreference,
  resolvedTheme,
  setThemePreference,
  setupSystemThemeListener,
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

function mediaMock(initialMatches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const query = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn<MediaQueryList["addEventListener"]>(
      (_type: string, next: EventListenerOrEventListenerObject) => {
        listener = next as (event: MediaQueryListEvent) => void;
      },
    ),
    removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    dispatchEvent: vi.fn<EventTarget["dispatchEvent"]>(),
  } as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn<(query: string) => MediaQueryList>(() => query));
  return { emit: (matches: boolean) => listener?.({ matches } as MediaQueryListEvent) };
}

describe("theme preferences", () => {
  beforeEach(() => {
    cleanupSystemThemeListener();
    vi.stubGlobal("localStorage", storageMock());
    mediaMock(false);
    setThemePreference("system");
  });

  it("restores valid values and rejects invalid stored values", () => {
    localStorage.setItem("clf_theme", "dark");
    expect(initialThemePreference()).toBe("dark");
    localStorage.setItem("clf_theme", "sepia");
    expect(initialThemePreference()).toBe("system");
  });

  it("persists explicit themes and synchronises the document", () => {
    setThemePreference("light");
    expect(localStorage.getItem("clf_theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("tracks operating-system changes only in system mode", () => {
    const media = mediaMock(false);
    setThemePreference("system");
    setupSystemThemeListener();
    media.emit(true);
    expect(resolvedTheme.value).toBe("dark");

    setThemePreference("light");
    media.emit(true);
    expect(resolvedTheme.value).toBe("light");
  });
});
