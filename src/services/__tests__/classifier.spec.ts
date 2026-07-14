import { describe, it, expect } from "vitest";
import { classifyCard } from "../classifier";
import type { ScryfallCard } from "../../domain/types";

function mockCard(overrides: Partial<ScryfallCard>): ScryfallCard {
  return {
    id: "test-id",
    name: "Test Card",
    type_line: "Land",
    color_identity: [],
    cmc: 0,
    ...overrides,
  };
}

describe("classifyCard", () => {
  it("classifies basic land correctly", () => {
    const card = mockCard({
      name: "Island",
      type_line: "Basic Land — Island",
      oracle_text: "{T}: Add {U}.",
      produced_mana: ["U"],
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.sourceType).toBe("basic");
    expect(profile!.producedColours).toContain("U");
    expect(profile!.isTappedOnEntry).toBe(false);
    expect(profile!.isBasicLand).toBe(true);
    expect(profile!.typedLandSubtypes).toContain("Island");
  });

  it("classifies shockland (Breeding Pool) as conditionalUntap", () => {
    const card = mockCard({
      name: "Breeding Pool",
      type_line: "Land — Forest Island",
      oracle_text:
        "({T}: Add {G} or {U}.)\nAs Breeding Pool enters the battlefield, you may pay 2 life. If you don't, it enters the battlefield tapped.",
      produced_mana: ["G", "U"],
      color_identity: ["G", "U"],
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.untapCondition).toBe("payTwoLife");
    expect(profile!.producedColours).toContain("G");
    expect(profile!.producedColours).toContain("U");
    expect(profile!.typedLandSubtypes).toContain("Forest");
    expect(profile!.typedLandSubtypes).toContain("Island");
  });

  it("classifies unconditional tapland as tapland", () => {
    const card = mockCard({
      name: "Dismal Backwater",
      type_line: "Land",
      oracle_text: "Dismal Backwater enters the battlefield tapped.\n{T}: Add {U} or {B}.",
      produced_mana: ["U", "B"],
      color_identity: ["U", "B"],
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.sourceType).toBe("tapland");
    expect(profile!.isTappedOnEntry).toBe(true);
    expect(profile!.availableFromTurn).toBe(2);
  });

  it("classifies Command Tower as rainbow", () => {
    const card = mockCard({
      name: "Command Tower",
      type_line: "Land",
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
      color_identity: [],
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.sourceType).toBe("rainbow");
    expect(profile!.isRainbow).toBe(true);
    expect(profile!.isTappedOnEntry).toBe(false);
  });

  it("classifies Polluted Delta as fetchland", () => {
    const card = mockCard({
      name: "Polluted Delta",
      type_line: "Land",
      oracle_text:
        "{T}, Pay 1 life, Sacrifice Polluted Delta: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.",
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.sourceType).toBe("fetchland");
    expect(profile!.isFetchland).toBe(true);
    expect(profile!.fetchTargetSubtypes).toContain("Island");
    expect(profile!.fetchTargetSubtypes).toContain("Swamp");
  });

  it("classifies Arcane Signet as twoManaRock", () => {
    const card = mockCard({
      name: "Arcane Signet",
      type_line: "Artifact",
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
      color_identity: [],
      cmc: 2,
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.sourceType).toBe("twoManaRock");
    expect(profile!.baseWeight).toBe(0.75);
    expect(profile!.availableFromTurn).toBe(3);
  });

  it("classifies Sol Ring as colourless mana rock", () => {
    const card = mockCard({
      name: "Sol Ring",
      type_line: "Artifact",
      oracle_text: "{T}: Add {C}{C}.",
      produced_mana: ["C"],
      cmc: 1,
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.isColourlessOnly).toBe(true);
    expect(profile!.baseWeight).toBe(0);
  });

  it("classifies fast land as conditionalUntap", () => {
    const card = mockCard({
      name: "Darkslick Shores",
      type_line: "Land",
      oracle_text:
        "Darkslick Shores enters the battlefield tapped unless you control two or fewer other lands.\n{T}: Add {U} or {B}.",
      produced_mana: ["U", "B"],
      color_identity: ["U", "B"],
    });
    const profile = classifyCard(card);
    expect(profile).not.toBeNull();
    expect(profile!.sourceType).toBe("conditionalUntap");
    expect(profile!.untapCondition).toBe("twoOrFewerLands");
    expect(profile!.isTappedOnEntry).toBe(true); // technically enters tapped unless condition met
  });

  it("returns null for a spell with no mana ability", () => {
    const card = mockCard({
      name: "Cancel",
      type_line: "Instant",
      oracle_text: "Counter target spell.",
      color_identity: ["U"],
      cmc: 3,
    });
    const profile = classifyCard(card);
    expect(profile).toBeNull();
  });
});
