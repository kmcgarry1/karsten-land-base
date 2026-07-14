import { readonly, ref } from "vue";
import { APP_STORAGE_KEYS, removeStorageKey } from "../security/storage";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

const THEME_STORAGE_KEY = APP_STORAGE_KEYS.theme;
const VALID_PREFERENCES = new Set<ThemePreference>(["system", "light", "dark"]);
const preference = ref<ThemePreference>("system");
const resolved = ref<ResolvedTheme>("dark");
let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && VALID_PREFERENCES.has(value as ThemePreference);
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initialThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && !isThemePreference(stored)) removeStorageKey(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(value: ThemePreference): ResolvedTheme {
  return value === "system" ? systemTheme() : value;
}

function applyResolvedTheme(value: ResolvedTheme): void {
  resolved.value = value;
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
}

export function setThemePreference(value: ThemePreference): void {
  preference.value = value;
  applyResolvedTheme(resolveTheme(value));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // The active theme still works when browser storage is unavailable.
  }
}

export function setupSystemThemeListener(): () => void {
  cleanupSystemThemeListener();
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};

  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaListener = (event: MediaQueryListEvent) => {
    if (preference.value === "system") applyResolvedTheme(event.matches ? "dark" : "light");
  };
  mediaQuery.addEventListener("change", mediaListener);
  return cleanupSystemThemeListener;
}

export function cleanupSystemThemeListener(): void {
  if (mediaQuery && mediaListener) mediaQuery.removeEventListener("change", mediaListener);
  mediaQuery = null;
  mediaListener = null;
}

export function initialiseTheme(): () => void {
  preference.value = initialThemePreference();
  applyResolvedTheme(resolveTheme(preference.value));
  return setupSystemThemeListener();
}

export const themePreference = readonly(preference);
export const resolvedTheme = readonly(resolved);
