import { createI18n } from "vue-i18n";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { APP_STORAGE_KEYS, removeStorageKey } from "../security/storage";

export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_STORAGE_KEY = APP_STORAGE_KEYS.locale;

export const localeOptions: Array<{ value: SupportedLocale; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

function browserLocale(): SupportedLocale {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase().split("-")[0];
  return isSupportedLocale(language) ? language : "en";
}

export function initialLocale(): SupportedLocale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && !isSupportedLocale(saved)) removeStorageKey(LOCALE_STORAGE_KEY);
    return isSupportedLocale(saved) ? saved : browserLocale();
  } catch {
    return browserLocale();
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: "en",
  messages: { en, es },
});

export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The in-memory locale still works when storage is unavailable.
  }
}

export function syncDocumentLocale(): void {
  if (typeof document !== "undefined") document.documentElement.lang = i18n.global.locale.value;
}
