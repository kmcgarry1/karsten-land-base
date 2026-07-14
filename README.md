# Commander Mana Base

Commander Mana Base is a browser-only Vue application for checking whether a Commander deck has enough coloured mana sources to cast important spells on curve.

Paste a decklist, resolve its cards through Scryfall, choose the spells and turns that matter, and compare the deck's effective sources with probability-based targets. The app provides a fast heuristic mode and a Monte Carlo simulation mode.

## What it does

- Imports decklists exported by MTGO, Moxfield, Archidekt, and CubeCobra.
- Guides first-time users through analysis mode, confidence, source assumptions, pod colours, and simulation effort before import.
- Detects Commander sections and supports selecting one or two commanders manually.
- Resolves card names, mana costs, oracle text, and images through Scryfall.
- Classifies lands, fetchlands, MDFCs, mana rocks, mana dorks, and common ramp spells.
- Automatically selects commanders and colour-intensive spells as initial analysis targets.
- Reports cast-on-curve probabilities, effective source counts, colour bottlenecks, and recommendations.
- Provides a card view for inspecting probability and source coverage across the deck.
- Supports English and Spanish through a persisted language picker.
- Includes cool-lavender light and deep-violet dark themes with a persisted system-aware picker.
- Saves decklists and analysis settings in the browser.
- Can continue in degraded mode when some card data cannot be resolved.

The results are decision-support estimates, not guarantees. Card classification and simulation deliberately simplify some gameplay decisions and card interactions. See [Analysis methodology](docs/analysis-methodology.md) for the model and its limitations.

## Quick start

1. Install dependencies and start the development server:

   ```sh
   npm install
   npm run dev
   ```

2. Open the local URL printed by Vite.
3. Paste a decklist, or select **Load Muldrotha sample deck**.
4. Review the parsed cards and confirm one or two commanders.
5. Select **Fetch card data**.
6. Choose **Strict Karsten** for a fast estimate or **Exact Simulation** for a slower Monte Carlo estimate.
7. Select **Run analysis**.
8. Review target results, source breakdowns, assumptions, and recommendations.

For import formats, saved decks, settings, unresolved cards, and report interpretation, read the [User guide](docs/user-guide.md).

## Documentation

- [User guide](docs/user-guide.md) — import and analyse a deck, adjust settings, and interpret results.
- [Analysis methodology](docs/analysis-methodology.md) — source counting, probability modes, assumptions, and known limitations.
- [Security policy](SECURITY.md) — vulnerability reporting and supported releases.
- [Security documentation](docs/security/threat-model.md) — threat model, controls, data handling, response, and release evidence.

## Development

Requirements:

- Node.js 24.x (24.15.0 or newer recommended)
- npm

Common commands:

```sh
npm install
npm run dev
npm run build
npm run test:unit -- --run
npm run lint
npm run verify
npm run security:audit
```

`npm run lint` applies automatic fixes. Review the resulting changes before committing them.

All `VITE_` environment variables are compiled into public frontend assets. Never place credentials or private values in them.

## Runtime and data

The app is a static frontend. It has no server-side accounts, authentication, or secrets.

- Deck text, saved decks, settings, onboarding completion, language and theme preferences, and cached card records are stored in the browser's `localStorage`.
- Card names are sent to `https://api.scryfall.com` for resolution.
- Card and mana-symbol images may be loaded from Scryfall-hosted domains.
- Scryfall card records are cached for seven days, with a maximum of 300 cache entries.
- Clearing site data removes saved decks, settings, and cached card records.
- A Scryfall outage can leave the app usable in degraded mode with cached records and unknown-card stubs.

Unknown cards do not contribute mana sources or spell targets in degraded analysis.

## Security checklist

- Do not add API keys, tokens, or private credentials to frontend code.
- Render remote card data through Vue interpolation; do not use `v-html` for remote content.
- Run `npm audit --audit-level=moderate` before release.
- Review dependency changes in `package-lock.json`.
- Confirm degraded Scryfall behavior does not fan out request retries.
- Confirm malformed settings and cache entries fall back safely.

The automated baseline is defined by `npm run verify` and the GitHub security workflows. The npm advisory baseline contained no known vulnerabilities when checked on 13 July 2026; recurring CI checks replace that point-in-time result.

## Deployment headers

Configure security headers at the static host or CDN layer. The exact image sources should match the Scryfall URLs emitted by the version of the API used in production.

```txt
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.scryfall.io data:; connect-src 'self' https://api.scryfall.com; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
X-Content-Type-Options: nosniff
```

Do not enforce the production CSP through `index.html` during local development; Vite tooling may need more permissive script and style behavior.

## Acknowledgements

The source-count targets are based on Frank Karsten's article, [How Many Sources Do You Need to Consistently Cast Your Spells? A 2022 Update](https://www.tcgplayer.com/content/article/how-many-sources-do-you-need-to-consistently-cast-your-spells-a-2022-update/dc23a7d2-0a16-4c0b-ad36-586fcca03ad8/).

Card data is provided by [Scryfall](https://scryfall.com/docs/api). This project is not affiliated with or endorsed by Wizards of the Coast, TCGplayer, or Scryfall.
# karsten-land-base
