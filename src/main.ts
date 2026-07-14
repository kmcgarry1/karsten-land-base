import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { i18n, syncDocumentLocale } from "./i18n";
import { initialiseTheme } from "./theme";

initialiseTheme();
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
syncDocumentLocale();
app.mount("#app");
