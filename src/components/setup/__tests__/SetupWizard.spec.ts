import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, setLocale } from "../../../i18n";
import { ONBOARDING_STORAGE_KEY } from "../../../onboarding";
import { useSettingsStore } from "../../../stores/settings";
import SetupWizard from "../SetupWizard.vue";

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

function mountWizard(firstRun = true) {
  return mount(SetupWizard, {
    props: { firstRun },
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { Teleport: true } },
  });
}

async function continueWizard(wrapper: ReturnType<typeof mountWizard>) {
  await wrapper.get(".wizard-footer .btn-primary").trigger("click");
}

describe("SetupWizard", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("localStorage", storageMock());
    setActivePinia(createPinia());
    setLocale("en");
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  it("opens as an accessible modal and focuses the current heading", async () => {
    const wrapper = mountWizard();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("dialog").attributes("aria-labelledby")).toBe("setup-title-welcome");
    expect(wrapper.get("h1").attributes("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(wrapper.get("h1").element);
  });

  it("skips first-run setup with defaults and records completion", async () => {
    const store = useSettingsStore();
    const before = JSON.stringify(store.settings);
    const wrapper = mountWizard();
    await wrapper.get(".wizard-footer .btn-ghost").trigger("click");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("1");
    expect(JSON.stringify(store.settings)).toBe(before);
  });

  it("cancels a reopened wizard without changing settings or completion", async () => {
    const store = useSettingsStore();
    const before = JSON.stringify(store.settings);
    const wrapper = mountWizard(false);
    await wrapper.get(".wizard-footer .btn-ghost").trigger("click");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    expect(JSON.stringify(store.settings)).toBe(before);
  });

  it("adds the iteration step for Exact mode and commits only on Finish", async () => {
    const store = useSettingsStore();
    const before = JSON.stringify(store.settings);
    const wrapper = mountWizard();

    await continueWizard(wrapper);
    await wrapper.get('input[value="exact"]').setValue(true);
    await continueWizard(wrapper);
    await wrapper.get('input[value="0.95"]').setValue(true);
    await continueWizard(wrapper);
    await wrapper.get('input[value="strict"]').setValue(true);
    await continueWizard(wrapper);
    await wrapper.get(".pod-colour.colour-u").trigger("click");
    await continueWizard(wrapper);

    expect(wrapper.text()).toContain("How much simulation work should run?");
    await wrapper.get('input[value="100000"]').setValue(true);
    await continueWizard(wrapper);
    expect(wrapper.text()).toContain("Your analysis setup is ready");
    expect(JSON.stringify(store.settings)).toBe(before);

    await continueWizard(wrapper);
    expect(store.settings.mode).toBe("exact");
    expect(store.settings.targetThreshold).toBe(0.95);
    expect(store.settings.simulationIterations).toBe(100000);
    expect(store.settings.knownPodColours).toEqual(["U"]);
    expect(store.settings.countTaplandsTurnTwo).toBe(false);
    expect(store.settings.countMDFCsAsLands).toBe(false);
    expect(store.settings.countOrchardAsThreeQuarter).toBe(false);
    expect(store.settings.countFellwarAsHalf).toBe(false);
    expect(wrapper.emitted("complete")).toHaveLength(1);
  });

  it("preserves a custom assumption profile when reopened", async () => {
    const store = useSettingsStore();
    store.applySettings({
      ...store.settings,
      countTaplandsTurnTwo: true,
      countMDFCsAsLands: false,
      countOrchardAsThreeQuarter: true,
      countFellwarAsHalf: false,
    });
    const wrapper = mountWizard(false);
    await continueWizard(wrapper);
    await continueWizard(wrapper);
    await continueWizard(wrapper);
    expect(wrapper.get('input[value="custom"]').attributes("checked")).toBeDefined();
    expect(wrapper.text()).toContain("Keep current custom settings");
  });

  it("handles Escape as dismissal and renders translated copy", async () => {
    setLocale("es");
    const wrapper = mountWizard(false);
    expect(wrapper.text()).toContain("Configura el análisis según tus objetivos");
    await wrapper.get("dialog").trigger("cancel");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
  });
});
