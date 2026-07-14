<script setup lang="ts">
import { RouterView, RouterLink, useRoute } from "vue-router";
import { computed, ref } from "vue";
import { Mountain, SlidersHorizontal } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import LanguagePicker from "./components/shared/LanguagePicker.vue";
import ThemePicker from "./components/shared/ThemePicker.vue";
import SetupWizard from "./components/setup/SetupWizard.vue";
import { useDeckStore } from "./stores/deck";
import { shouldShowOnboarding } from "./onboarding";

const route = useRoute();
const deckStore = useDeckStore();
const { t } = useI18n();
const isAnalysis = computed(() => route.name === "analysis" || route.name === "analysis-cards");
const setupOpen = ref(shouldShowOnboarding());
const setupFirstRun = ref(setupOpen.value);

const commanderArt = computed(() => {
  const commander = deckStore.commanders[0];
  if (!commander) return "";

  const faceArt =
    commander.faces?.find((face) => face.imageUris?.artCrop)?.imageUris?.artCrop ??
    commander.faces?.find((face) => face.imageUris?.large)?.imageUris?.large ??
    commander.faces?.find((face) => face.imageUris?.normal)?.imageUris?.normal;

  return (
    commander.imageUris?.artCrop ??
    commander.imageUris?.large ??
    commander.imageUris?.normal ??
    faceArt ??
    ""
  );
});

const shellStyle = computed<Record<string, string>>(() =>
  commanderArt.value
    ? { "--commander-art": cssUrl(commanderArt.value) }
    : ({} as Record<string, string>),
);

function cssUrl(value: string): string {
  return `url("${value.replace(/["\\\n\r]/g, "")}")`;
}

function openSetup() {
  setupFirstRun.value = false;
  setupOpen.value = true;
}

function closeSetup() {
  setupOpen.value = false;
}
</script>

<template>
  <div
    class="app-shell min-h-screen"
    :class="{ 'app-shell-analysis': isAnalysis, 'has-commander-art': commanderArt }"
    :style="shellStyle"
  >
    <header class="app-bar">
      <div class="app-header">
        <RouterLink to="/" class="app-logo" :aria-label="t('app.homeLabel')">
          <Mountain class="logo-icon" :size="20" />
          <div class="logo-copy">
            <span class="logo-text">{{ t("app.name") }}</span>
          </div>
        </RouterLink>

        <nav class="app-nav" :aria-label="t('app.primaryNavigation')">
          <RouterLink
            :to="{ name: 'import' }"
            class="nav-link"
            :class="{ active: route.name === 'import' }"
          >
            {{ t("nav.import") }}
          </RouterLink>
          <RouterLink
            :to="{ name: 'analysis' }"
            class="nav-link"
            :class="{ active: isAnalysis }"
          >
            {{ t("nav.analysis") }}
          </RouterLink>
          <RouterLink
            :to="{ name: 'settings' }"
            class="nav-link"
            :class="{ active: route.name === 'settings' }"
          >
            {{ t("nav.settings") }}
          </RouterLink>
        </nav>
        <div class="header-utilities">
          <button type="button" class="setup-trigger" :aria-label="t('wizard.open')" @click="openSetup">
            <SlidersHorizontal :size="15" aria-hidden="true" />
            <span>{{ t("wizard.setup") }}</span>
          </button>
          <ThemePicker />
          <LanguagePicker />
        </div>
      </div>
    </header>

    <main>
      <RouterView />
    </main>

    <footer class="app-footer">
      <div class="footer-inner">
        {{ t("app.footerPrefix") }}
        <em>{{ t("app.footerTitle") }}</em>
      </div>
    </footer>

    <SetupWizard
      v-if="setupOpen"
      :first-run="setupFirstRun"
      @complete="closeSetup"
      @dismiss="closeSetup"
    />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  isolation: isolate;
  background: transparent;
}

.app-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -2;
  background: var(--background);
  pointer-events: none;
}

.app-shell.has-commander-art::before {
  background-color: var(--background);
  background-image: var(--commander-art);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  background-blend-mode: luminosity;
  opacity: var(--art-opacity);
}

.app-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--border);
  background: var(--header);
  backdrop-filter: none;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 1240px;
  min-height: 66px;
  margin: 0 auto;
  padding: 0 20px;
}

.app-nav {
  display: inline-flex;
  flex-shrink: 0;
  align-self: stretch;
  gap: 18px;
  margin-left: auto;
  border: 0;
  background: transparent;
  padding: 0;
}

.nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 0;
  padding: 3px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
}

.nav-link:hover {
  background: transparent;
  color: var(--text);
  text-decoration: none;
}

.nav-link.active {
  background: transparent;
  color: var(--text);
}

.nav-link.active::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 3px;
  background: var(--accent);
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  min-width: 0;
}

.logo-icon {
  display: flex;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-strong);
  color: var(--accent);
  padding: 7px;
  flex-shrink: 0;
}

.logo-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.logo-text {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  line-height: 1.1;
}

.header-utilities {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.setup-trigger {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--border-strong);
  padding: 0 4px;
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
}

.setup-trigger:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.app-footer {
  border-top: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-muted);
}

.footer-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 18px 20px;
  text-align: center;
  font-size: 12px;
}

@media (max-width: 760px) {
  .app-header {
    gap: 10px;
    padding-inline: 14px;
  }

  .app-nav {
    gap: 12px;
  }

  .nav-link {
    padding-inline: 0;
  }
}

@media (max-width: 620px) {
  .logo-copy {
    display: none;
  }

  .setup-trigger span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}

@media (max-width: 460px) {
  .app-header {
    gap: 6px;
  }

  .nav-link {
    padding-inline: 0;
    font-size: 11px;
  }

  .app-nav {
    gap: 9px;
  }

  .header-utilities {
    gap: 5px;
  }
}
</style>
