# User guide

Commander Mana Base estimates whether a Commander deck can produce the coloured mana needed to cast selected spells by selected turns.

The normal workflow is:

```text
Paste decklist -> review parsing -> resolve card data -> choose settings -> run analysis
```

Use the language picker in the application header to switch between English and Spanish. The selection is saved for future visits in the same browser.

Use the adjacent theme picker to choose **System**, **Light**, or **Dark**. System follows the operating-system colour preference and updates when it changes; an explicit Light or Dark selection overrides the system until changed again.

## First-time setup

On a new installation, the app opens a short setup wizard before deck import. It explains and configures:

- Strict Karsten or Exact Simulation mode;
- an 80%, 90%, or 95% cast-on-curve goal;
- recommended or strict source-counting assumptions;
- known colours in your regular pod; and
- simulation iterations when Exact mode is selected.

The wizard keeps its choices as a draft until **Save setup**. **Skip setup** retains the recommended defaults and completes onboarding. Use **Setup** in the application header to run the wizard again; cancelling a reopened wizard leaves current settings unchanged.

## 1. Import a decklist

Paste a text deck export into the **Decklist** field. The parser accepts entries such as:

```text
1 Sol Ring
4x Lightning Bolt
1 Atraxa, Praetors' Voice *CMDR*
1 Island (M21) 265
```

It recognizes `Commander`, `Commanders`, `Mainboard`, `Sideboard`, and `Maybeboard` section headings. A heading may also begin with `//`:

```text
// Commander
1 Muldrotha, the Gravetide

// Mainboard
1 Command Tower
1 Island
```

The parser removes common export annotations, including set and collector information, trailing `#` comments, bracketed tags, `{...}` tags, and commander suffixes.

Select **Review decklist** after pasting. The review shows:

- parsed entries;
- selected commanders;
- main-deck entries;
- detected sections;
- duplicate names; and
- lines that could not be parsed.

Parse errors must be corrected before card data can be fetched. Duplicate names are warnings rather than blocking errors; check whether their quantities should be combined.

### Commander selection

Cards in a Commander section or marked with `*CMDR*` or `(Commander)` are selected automatically. If the export does not identify its commander, select it in the review panel.

You can select at most two commanders. One selected commander produces a 99-card library model; two selected commanders produce a 98-card library model.

## 2. Resolve card data

Select **Fetch card data** after the deck parses without errors. The app checks its browser cache, sends unresolved card names to Scryfall in batches, and classifies returned cards as potential mana sources or spell targets.

The card-data panel separates cached, requested, resolved, and unresolved records.

### Split cards and double-faced cards

For a name containing ` // `, the first face is used for the Scryfall collection lookup. Returned face names are mapped back to the complete Scryfall record. If a face name remains unresolved, try the full name shown by Scryfall.

### Unresolved cards

For each unresolved card, the app shows its normalized lookup name and a likely cause. You can:

- open a Scryfall search for the name;
- retry using the normalized lookup name;
- copy the original or normalized unresolved-name list;
- clear the local card cache and retry the complete deck; or
- continue with cached and stub records.

Continuing with stub records creates a degraded analysis. Unknown cards remain in the deck count but contribute no coloured sources and cannot become spell targets. Treat a degraded result as incomplete, especially when unresolved cards are lands, ramp, or colour-intensive spells.

## 3. Choose analysis settings

Settings can be changed on the import screen or the dedicated **Settings** page. They persist in the browser.

### Analysis mode

**Strict Karsten** is the default. It quickly compares weighted source counts with Commander source targets and produces a hypergeometric probability estimate.

**Exact Simulation** runs a Monte Carlo simulation in a Web Worker. Despite its UI name, it remains a model: it simulates draws, a fixed mulligan policy, and source availability, but not every sequencing choice, generic-mana constraint, spell interaction, or replacement effect.

Read [Analysis methodology](analysis-methodology.md) before using either result as a deck-building threshold.

### Probability threshold

The probability threshold determines whether a target displays **Pass** or **Fail**. It defaults to 90% and can be set from 50% to 99%.

The per-colour **needed sources** figure comes from the fixed Karsten-style source table and does not change when you move the probability slider. The displayed probability and pass/fail status do change.

### Karsten assumptions

- **Count taplands from turn 2:** allows tapped sources to count at full heuristic weight for turn-two and later targets.
- **Count MDFCs as land sources:** allows a modal double-faced card's land face to contribute a source.
- **Exotic Orchard at 3/4 weight:** discounts it when opposing colours are unknown.
- **Fellwar Stone at 1/2 weight:** discounts it when opposing colours are unknown.
- **Known pod colours:** counts opponent-dependent production at a higher weight for colours known to be present among opponents.

These settings primarily affect Strict Karsten analysis. See the methodology's simulation limitations before assuming that each toggle is reproduced by Exact Simulation.

### Simulation iterations

Available iteration counts range from 10,000 to 200,000; the default is 50,000. More iterations generally reduce sampling noise but take longer. They do not remove modelling limitations.

## 4. Run analysis

Select **Run analysis** after a commander is selected and card data is ready or degraded.

The app automatically chooses initial targets:

- selected commanders with coloured mana requirements; and
- up to five nonland spells with at least two pips of the same colour, ordered by mana value.

You can edit the target list from the report. For each target, configure:

- **Turn:** when you want the spell to be cast;
- **Goal:** its individual success threshold; and
- **Priority:** must, nice, or late.

You can also add a target by card name or by a mana-cost string such as `{2}{U}{U}`. A manually typed card name is not looked up at this stage; only mana symbols present in the text are parsed into pip requirements. If you enter only a name, verify that the resulting coloured-pip requirements are correct.

Select **Re-analyse** after changing the mode or targets.

## 5. Read the report

### Summary

The summary shows:

- the number of passing targets;
- total lands and lands classified as entering tapped; and
- the analysis mode used for the current report.

A target passes when its selected-mode probability meets its individual goal.

### Source summary

The source summary is grouped by colour. For each relevant colour it reports:

- land sources;
- rock or ramp sources;
- total effective sources after weighting;
- the Karsten-style source target; and
- the resulting deficit.

One dual or rainbow land can count as a source for multiple colours. Effective-source totals therefore should not be added together to infer a land count.

### Target details

Each target includes its required pips, target turn, probability, status, and colour bottleneck. Expanding a target breaks contributions into lands, fetches, conditional sources, rocks and ramp, and opponent-dependent sources.

The colour bottleneck is the required colour with the lowest estimated probability. It does not prove that adding a basic land of that colour is the best fix; consider fetch targets, untapped requirements, total land count, and other target spells.

### Recommendations and warnings

Recommendations are generated from source deficits. They identify likely directions—such as adding coloured sources or improving dual-land coverage—not specific optimal swaps.

Warnings call out conditions such as low land count, many tapped lands, or degraded card data. Expand **Model assumptions** to see the rules used for the report.

### Card view

Select **Card view** to inspect nonland cards across the deck. You can switch between table and grid layouts, search, filter by colour or mana value, and restrict the results to failures. Expanded rows show requirements, notes, and source contributions.

The card view can run Exact Simulation for the currently filtered cards. Large result sets and high iteration counts take longer.

### Copying a report

Select **Copy summary** to copy a Markdown summary containing commander information, mode, threshold, land counts, colour-source totals, target results, warnings, and recommendations.

## 6. Save and restore decks

**Save deck** stores the raw decklist, commander selection, and current settings in this browser. Saving another deck with the same name replaces that saved snapshot while preserving its original creation time.

Loading a saved deck restores its text, selected commanders, and settings. Card data must then be resolved again, although valid card records may already be available in the local cache.

Deleting a saved deck cannot be undone. Clearing browser site data also removes all saved decks.

## Privacy and local data

The app has no account or backend database.

- Settings use the `clf_settings` local-storage key.
- Language preference uses `clf_locale`.
- Theme preference uses `clf_theme`.
- First-run completion uses `clf_onboarding_version`.
- Saved decks use `clf_saved_decks`.
- cached Scryfall records use keys beginning with `clf_card_`.
- card records expire after seven days and the cache is capped at 300 entries.

Card names are sent to the Scryfall API when they are not available in the cache. Card images may be fetched from Scryfall's image hosts by the browser.

Use **Settings → Clear all local data** to remove every application-owned `clf_` entry, including saved decks, preferences, and cached card records. The confirmation does not remove unrelated storage belonging to other applications on the same origin.

## Troubleshooting

### The fetch button is disabled

Make sure the deck contains at least one parsed entry, has no parse errors, and has been reviewed.

### The analysis button is disabled

Select one or two commanders and fetch card data, or explicitly continue with cached/stub data after a failed request.

### A valid card is unresolved

Check spelling and punctuation, try the full Scryfall split-card or double-faced name, use the normalized-name retry, and then clear the cache if the stored record may be stale.

### Results changed after switching mode

The two modes use different models. Strict Karsten uses weighted effective sources and a fast probability estimate; Exact Simulation samples opening hands and draws. Differences are expected, particularly for tapped or conditional sources.

### Saved data disappeared

Saved data is specific to the current browser profile and site origin. Private browsing, clearing site data, or using a different development URL or port can expose a different local-storage area.
