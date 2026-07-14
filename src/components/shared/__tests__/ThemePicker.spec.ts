import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, setLocale } from "../../../i18n";
import { setThemePreference } from "../../../theme";
import ThemePicker from "../ThemePicker.vue";

describe("ThemePicker", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, String(value)),
    });
    setLocale("en");
    setThemePreference("system");
  });

  it("exposes all theme choices with an accessible label", () => {
    const wrapper = mount(ThemePicker, { global: { plugins: [i18n] } });
    const select = wrapper.get("select");
    expect(select.attributes("aria-label")).toBe("Select colour theme");
    expect(wrapper.findAll("option").map((option) => option.text())).toEqual([
      "System",
      "Light",
      "Dark",
    ]);
  });

  it("applies and persists the selected theme", async () => {
    const wrapper = mount(ThemePicker, { global: { plugins: [i18n] } });
    await wrapper.get("select").setValue("dark");
    expect(localStorage.getItem("clf_theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
