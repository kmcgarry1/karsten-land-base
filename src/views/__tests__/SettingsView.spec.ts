import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, setLocale } from "../../i18n";
import { clearApplicationDataAndReload } from "../../security/storage";
import SettingsView from "../SettingsView.vue";

vi.mock("../../security/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../security/storage")>();
  return { ...original, clearApplicationDataAndReload: vi.fn<() => void>() };
});

describe("Settings local-data control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn<() => boolean>(() => true));
    setLocale("en");
  });

  function mountView() {
    return mount(SettingsView, { global: { plugins: [createPinia(), i18n] } });
  }

  it("confirms before clearing all application data", async () => {
    const wrapper = mountView();
    const button = wrapper.findAll("button").find((candidate) => candidate.text() === "Clear all local data");
    expect(button).toBeTruthy();
    await button!.trigger("click");
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(clearApplicationDataAndReload).toHaveBeenCalledOnce();
  });

  it("does not clear when confirmation is cancelled and provides Spanish copy", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    setLocale("es");
    const wrapper = mountView();
    const button = wrapper.findAll("button").find((candidate) => candidate.text() === "Borrar todos los datos locales");
    expect(button).toBeTruthy();
    await button!.trigger("click");
    expect(clearApplicationDataAndReload).not.toHaveBeenCalled();
  });
});
