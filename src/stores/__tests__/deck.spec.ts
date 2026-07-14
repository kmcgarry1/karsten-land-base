import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { normalizeDeckCardName, parseDecklist, useDeckStore } from "../deck";
import { SECURITY_LIMITS } from "../../security/limits";

describe("parseDecklist metadata", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("detects commander sections and section names", () => {
    const parsed = parseDecklist(`// Commander
1 Muldrotha, the Gravetide

Mainboard
1 Island`);

    expect(parsed.commanderEntries).toHaveLength(1);
    expect(parsed.commanderEntries[0]?.name).toBe("Muldrotha, the Gravetide");
    expect(parsed.deckEntries).toHaveLength(1);
    expect(parsed.sections).toEqual(["Commander", "Mainboard"]);
  });

  it("reports duplicate card names", () => {
    const parsed = parseDecklist(`1 Island
1 Sol Ring
2 Island`);

    expect(parsed.duplicateNames).toEqual(["Island"]);
  });

  it("reports parse errors without dropping valid entries", () => {
    const parsed = parseDecklist(`not a card line
1 Command Tower`);

    expect(parsed.errors).toEqual(['Could not parse line: "not a card line"']);
    expect(parsed.entries).toHaveLength(1);
  });

  it("normalizes set codes, comments, and annotations", () => {
    expect(normalizeDeckCardName("Sol Ring (LTC) 279 *F* # ramp")).toBe("Sol Ring");
    expect(normalizeDeckCardName("Brightclimb Pathway // Grimclimb Pathway")).toBe(
      "Brightclimb Pathway // Grimclimb Pathway",
    );
  });

  it("parses the Squall deck fixture without losing MDFC/pathway names", () => {
    const parsed = parseDecklist(`//Commander
1 Squall, SeeD Mercenary

//Main
1 Brightclimb Pathway // Grimclimb Pathway
9 Plains
6 Swamp
1 Sol Ring (LTC) 279
1 Mother of Runes # protection`);

    expect(parsed.commanderEntries.map((entry) => entry.name)).toEqual([
      "Squall, SeeD Mercenary",
    ]);
    expect(parsed.deckEntries.find((entry) => entry.name.includes("Brightclimb"))?.lookupName).toBe(
      "Brightclimb Pathway",
    );
    expect(parsed.deckEntries.map((entry) => entry.name)).toContain("Sol Ring");
    expect(parsed.deckEntries.map((entry) => entry.name)).toContain("Mother of Runes");
    expect(parsed.errors).toEqual([]);
  });

  it("returns empty metadata for an empty decklist", () => {
    const parsed = parseDecklist("");

    expect(parsed.entries).toEqual([]);
    expect(parsed.commanderEntries).toEqual([]);
    expect(parsed.deckEntries).toEqual([]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.duplicateNames).toEqual([]);
    expect(parsed.sections).toEqual([]);
  });

  it("rejects oversized input, quantities, names, and entry counts", () => {
    expect(parseDecklist("x".repeat(SECURITY_LIMITS.deckTextCharacters + 1)).errors[0]).toContain(
      "exceeds",
    );
    expect(parseDecklist("1000 Island").errors[0]).toContain("Invalid quantity");
    expect(parseDecklist(`1 ${"x".repeat(SECURITY_LIMITS.cardNameCharacters + 1)}`).errors[0]).toContain(
      "Invalid card name",
    );
    const entries = Array.from(
      { length: SECURITY_LIMITS.deckEntries + 1 },
      (_, index) => `1 Card ${index}`,
    ).join("\n");
    expect(parseDecklist(entries).errors).toContain(
      `Decklist exceeds the ${SECURITY_LIMITS.deckEntries} entry limit.`,
    );
  });

  it("supports manually selecting one commander", () => {
    const store = useDeckStore();
    store.setRawText(`1 Aragorn, the Uniter
1 Island`);

    store.setCommanderEntries(["Aragorn, the Uniter"]);

    expect(store.parsed?.commanderEntries.map((entry) => entry.name)).toEqual([
      "Aragorn, the Uniter",
    ]);
    expect(store.parsed?.deckEntries.map((entry) => entry.name)).toEqual(["Island"]);
  });

  it("supports manually selecting two commanders", () => {
    const store = useDeckStore();
    store.setRawText(`1 Tana, the Bloodsower
1 Tymna the Weaver
1 Forest`);

    store.setCommanderEntries(["Tana, the Bloodsower", "Tymna the Weaver"]);

    expect(store.parsed?.commanderEntries.map((entry) => entry.name)).toEqual([
      "Tana, the Bloodsower",
      "Tymna the Weaver",
    ]);
  });
});
