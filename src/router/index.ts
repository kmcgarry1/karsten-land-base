import { createRouter, createWebHashHistory } from "vue-router";
import DeckImportView from "../views/DeckImportView.vue";
import AnalysisView from "../views/AnalysisView.vue";
import AnalysisCardsView from "../views/AnalysisCardsView.vue";
import SharedAnalysisView from "../views/SharedAnalysisView.vue";
import SettingsView from "../views/SettingsView.vue";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "import", component: DeckImportView },
    { path: "/analysis", name: "analysis", component: AnalysisView },
    { path: "/analysis/shared", name: "analysis-shared", component: SharedAnalysisView },
    { path: "/analysis/cards", name: "analysis-cards", component: AnalysisCardsView },
    { path: "/settings", name: "settings", component: SettingsView },
  ],
});

export default router;
