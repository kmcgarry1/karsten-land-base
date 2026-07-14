# Analysis methodology

Commander Mana Base answers a narrow question: given a deck, a coloured mana requirement, and a target turn, how consistently does the model expect the deck to expose enough sources of each required colour?

It does not determine whether the deck will have enough total mana in every game, whether a line is strategically correct, or whether a source survives and resolves. Results should be read as comparative deck-building evidence.

## Terminology

- **Source:** a card classified as capable of providing a required colour, directly or through a modeled fetch or ramp effect.
- **Effective source:** a source multiplied by a weight between zero and one for the current spell and turn.
- **Target:** a spell-like requirement containing coloured pips, total mana value, target turn, probability goal, and priority.
- **Cast on curve:** meeting the modeled coloured-pip requirement by the target turn.
- **Bottleneck:** the required colour with the lowest estimated probability.
- **Needed sources:** the source-count target from the app's Commander threshold table.

## Inputs and classification

The app retrieves card name, type line, mana cost, oracle text, colour identity, produced mana, faces, layout, and image references from Scryfall. A heuristic classifier converts relevant cards into mana-source profiles.

Profile data includes:

- source category;
- colours produced;
- typed land subtypes;
- whether the card enters tapped or has an untap condition;
- fetchable subtypes;
- activation timing;
- summoning-sickness timing;
- MDFC properties; and
- a base heuristic weight.

Classification combines Scryfall fields, oracle-text patterns, and explicit lists of known fetchlands, rainbow sources, ramp spells, and opponent-dependent cards. New cards or unusual wording can therefore be classified incompletely. Unresolved cards receive no source profile.

## Strict Karsten mode

Strict Karsten mode has two related outputs:

1. a comparison between effective source counts and a Commander source-target table; and
2. a fast hypergeometric probability estimate used for pass/fail status.

The source targets are adapted from Frank Karsten's [How Many Sources Do You Need to Consistently Cast Your Spells? A 2022 Update](https://www.tcgplayer.com/content/article/how-many-sources-do-you-need-to-consistently-cast-your-spells-a-2022-update/dc23a7d2-0a16-4c0b-ad36-586fcca03ad8/). That work incorporates a Commander free mulligan and first-turn draw and targets roughly 90% consistency under its stated assumptions.

This app is an implementation inspired by that methodology, not a reproduction of Karsten's complete calculation. Its probability display uses its own hypergeometric approximation.

### Source targets

The built-in table covers one through five pips and turns one through six. Representative values are:

| Requirement | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---:|---:|---:|---:|---:|---:|
| One pip | 19 untapped | 18 | 16 | 14 | 13 | 11 |
| Two pips | 29 untapped | 29 | 27 | 24 | 21 | 18 |
| Three pips | — | — | 35 | 30 | 26 | 22 |
| Four pips | — | — | — | 38 | 33 | 28 |
| Five pips | — | — | — | — | 39 | 35 |

For targets after turn six, the app subtracts two sources per additional turn from the turn-six value, with a floor of zero. Unsupported combinations fall back to 14 sources; requirements above five pips fall back to 99. These fallbacks are implementation safeguards, not validated deck-building recommendations.

The **needed sources** value remains tied to this table even if a user selects a pass threshold other than 90%.

### Effective source weights

Weights depend on the target colour, turn, and mana value.

| Source | Heuristic treatment |
|---|---|
| Basic or unconditional coloured land | 1.0 for each colour it produces |
| Rainbow land | 1.0 for each colour in the commander's colour identity |
| Fetchland | 1.0 if it can find an in-deck typed land of the required colour |
| Always-tapped or bounce land on turn one | 0 |
| Fast land on turn one | 1.0 |
| Check or slow land on turn one | 0 |
| Shockland on turn one | 1.0, assuming two life is paid |
| Tapped source from turn two onward | 1.0 by default; 0 in strict untapped mode |
| MDFC land face | 1.0 when MDFC counting is enabled, subject to turn-one tapped handling |
| Two-mana rock or mana dork | 0.75 for mana-value-three-or-greater spells; otherwise 0 |
| Turn-two ramp | 1.0 for mana-value-three-or-greater targets on turn three or later |
| Turn-three ramp | 1.0 for mana-value-four-or-greater targets on turn four or later |
| Exotic Orchard, unknown pod | 0.75 by default |
| Fellwar Stone, unknown pod | 0.5 by default |
| Opponent-dependent source, required colour known in pod | full modeled weight |
| Colourless-only source | 0 for coloured requirements |

A fetchland counts only when a compatible basic land subtype appears among the deck's classified profiles. The calculation models access to a colour, not competition among several fetchlands for a limited number of targets.

### Hypergeometric estimate

For each required colour, the app estimates the probability of seeing at least the required number of coloured sources using a hypergeometric distribution:

```text
P(X = k) = C(K, k) * C(N - K, n - k) / C(N, n)
```

where:

- `N` is 99 for one commander or 98 for two commanders;
- `K` is the rounded effective-source count;
- `n` is the rounded effective number of cards seen; and
- `k` is the number of pips required in that colour.

The effective number of cards seen is:

```text
7-card opening hand + target turn + first-turn draw + 1.5-card mulligan bonus
```

For a multicolour target, each colour is evaluated separately and the lowest per-colour probability becomes the target's displayed heuristic probability. This conservative minimum is not the joint probability of satisfying all colours simultaneously.

### Land-count assumptions

The report describes the Karsten-style table as assuming 41 lands for a 99-card library and 40 for a 98-card library. The actual deck's land count does not rescale the source targets.

The app warns when it finds fewer than 35 lands. It also warns when more than eight classified sources enter tapped because the default turn-two-and-later treatment can be optimistic.

## Exact Simulation mode

Exact Simulation is the product's name for a Monte Carlo model. It runs in a Web Worker and repeats randomized opening hands and draws for every selected target.

### Mulligan model

Each trial follows this policy:

1. Draw a free seven-card look and keep it with three to five lands.
2. Otherwise start a London mulligan sequence at seven cards.
3. Keep seven with two to five lands.
4. Keep six or five with two to four lands.
5. Always keep four.
6. When bottoming, prefer lands before nonlands.
7. Draw one card on every turn, including turn one.

After the mulligan, trials with fewer than two lands are excluded from the probability denominator.

### Availability model

The simulation expands the deck by quantity and converts classified sources into simplified cards. It then makes a source available based on when it was drawn and its profile:

- an untapped land can be available on its draw turn;
- a tapped land becomes available on the following turn;
- a mana dork becomes available on the following turn;
- a source with an activation delay becomes available according to its configured turn offset; and
- a fetchland exposes the colours associated with its configured target subtypes.

A trial succeeds when the number of available sources for every required colour meets the pip requirement. The reported value is successful valid trials divided by all valid trials.

### Iterations and sampling error

The app offers 10,000, 50,000, 100,000, and 200,000 requested iterations. Trials excluded for having fewer than two kept lands reduce the number used in the final denominator.

Monte Carlo results vary between runs. More iterations usually reduce random variation, but cannot correct assumptions or missing rules in the model.

## Important limitations

Both modes simplify Magic gameplay. In particular:

- Generic mana and total mana value are not enforced by the simulation's final casting check; it verifies coloured pips.
- A source that can produce several colours is counted independently toward each colour. The simulation does not allocate individual permanents across simultaneous pip requirements.
- Land plays are not explicitly sequenced or limited to one per turn.
- The simulation does not remove fetched cards from the library or consume fetch targets.
- The simulation does not model life payments, bounce-land costs, conditional untap decisions, or detailed activation costs.
- The simulation does not apply the Karsten mode's fractional weights for opponent-dependent sources.
- Known pod colours and several heuristic toggles are not consulted by the current simulation worker.
- Interaction, counterspells, removal, summoning-sickness exceptions, cost modifiers, treasures, rituals, and most card-specific rules are not modeled.
- Hybrid, Phyrexian, colourless, variable, and other non-basic mana symbols are not fully represented by the pip parser.
- The heuristic probability for multicolour spells is the minimum marginal probability, not an exact joint probability.
- Unknown or misclassified cards cannot contribute correctly.

Because of these limits, “Exact” should be read as “simulated under the app's explicit model,” not mathematically exact gameplay probability.

## Reading recommendations

Recommendations are deterministic messages derived from failing targets and overall colour deficits. Their priorities are based on the size and severity of those deficits.

They do not search a card database for optimal replacements, calculate budget, preserve land-type interactions, or optimize the mana base as a whole. Use the source breakdown to understand why a recommendation appeared before changing the deck.

## Reproducibility and validation

Strict Karsten results are deterministic for a fixed deck, classification set, targets, and settings. Exact Simulation uses `Math.random()` and no user-visible seed, so individual runs are not reproducible.

Engine tests cover the hypergeometric helpers, source thresholds, source counting, and report behavior. Classifier and store tests cover representative card profiles, parsing, persistence validation, cached data, degraded state, and analysis orchestration. Tests reduce regression risk but do not establish that the simplified model covers every Magic card or game state.

## References

- Frank Karsten, [How Many Sources Do You Need to Consistently Cast Your Spells? A 2022 Update](https://www.tcgplayer.com/content/article/how-many-sources-do-you-need-to-consistently-cast-your-spells-a-2022-update/dc23a7d2-0a16-4c0b-ad36-586fcca03ad8/).
- [Scryfall API documentation](https://scryfall.com/docs/api).
- [Scryfall API access and rate-limit guidance](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17).
