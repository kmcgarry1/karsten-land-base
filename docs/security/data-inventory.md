# Data Inventory and Retention

The application is account-free and does not send first-party telemetry.

| Data | Location | Retention | External disclosure |
| --- | --- | --- | --- |
| Current deck text and analysis | Browser memory | Current session | Card names sent to Scryfall when resolution is requested |
| Saved decks | `clf_saved_decks` in `localStorage` | Until user clears it or site data | Card names sent to Scryfall when loaded and resolved |
| Analysis settings | `clf_settings` | Until reset or cleared | None |
| Language, theme, onboarding | `clf_locale`, `clf_theme`, `clf_onboarding_version` | Until cleared | None |
| Card records | `clf_card_*` | Seven days, maximum 300 entries | Originates from Scryfall |
| Card and mana-symbol images | Browser/network cache | Browser-controlled | Direct requests to Scryfall image hosts |

Browser storage is not encrypted and must not be treated as a confidential vault. **Clear all local data** removes every application-owned `clf_` key while preserving unrelated origin storage. Clearing browser site data has the same effect.

No application data is sold, used for advertising, or deliberately logged by the frontend. Vercel, GitHub, npm, and Scryfall process normal infrastructure metadata under their own terms.
