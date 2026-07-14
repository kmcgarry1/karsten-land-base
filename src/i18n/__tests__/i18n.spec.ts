import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialLocale, setLocale } from "../index";

describe("locale preferences", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, String(value));
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage);
    setLocale("en");
  });

  it("restores a supported saved locale", () => {
    localStorage.setItem("clf_locale", "es");
    expect(initialLocale()).toBe("es");
  });

  it("ignores an unsupported saved locale", () => {
    localStorage.setItem("clf_locale", "xx");
    expect(["en", "es"]).toContain(initialLocale());
  });

  it("persists the locale and updates the document language", () => {
    setLocale("es");
    expect(localStorage.getItem("clf_locale")).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });
});
