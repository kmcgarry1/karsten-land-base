import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ScryfallCard } from "../../domain/types";
import { useCardDataStore } from "../cardData";
import { batchFetchCards, countCachedCards } from "../../services/scryfall";

vi.mock("../../services/scryfall", () => ({
  batchFetchCards: vi.fn<typeof batchFetchCards>(),
  clearScryfallCache: vi.fn<() => void>(),
  countCachedCards: vi.fn<typeof countCachedCards>(),
  scryfallToCardRecord: vi.fn<(card: ScryfallCard, quantity?: number) => unknown>((card, quantity = 1) => ({
    scryfallId: card.id,
    name: card.name,
    typeLine: card.type_line,
    colourIdentity: card.color_identity,
    cmc: card.cmc,
    quantity,
  })),
}));

function mockCard(name: string): ScryfallCard {
  return {
    id: `${name}-id`,
    name,
    type_line: "Basic Land — Island",
    oracle_text: "{T}: Add {U}.",
    color_identity: ["U"],
    produced_mana: ["U"],
    cmc: 0,
  };
}

function mockMdfc(): ScryfallCard {
  return {
    id: "fell-the-profane-id",
    name: "Fell the Profane // Fell Mire",
    type_line: "Instant // Land",
    color_identity: ["B"],
    cmc: 4,
    layout: "modal_dfc",
    card_faces: [
      {
        name: "Fell the Profane",
        type_line: "Instant",
        mana_cost: "{3}{B}",
        oracle_text: "Destroy target creature or planeswalker.",
        colors: ["B"],
      },
      {
        name: "Fell Mire",
        type_line: "Land",
        oracle_text: "Fell Mire enters the battlefield tapped.\n{T}: Add {B}.",
        produced_mana: ["B"],
      },
    ],
  };
}

describe("card data resolution state", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(batchFetchCards).mockReset();
    vi.mocked(countCachedCards).mockReset();
    vi.mocked(countCachedCards).mockReturnValue(0);
  });

  it("marks successful resolution as ready", async () => {
    vi.mocked(batchFetchCards).mockResolvedValue(new Map([["Island", mockCard("Island")]]));
    const store = useCardDataStore();

    await store.resolveCards([{ name: "Island", quantity: 1 }]);

    expect(store.resolutionStatus).toBe("ready");
    expect(store.resolvedCount).toBe(1);
    expect(store.unresolvedCount).toBe(0);
    expect(store.sourceProfiles.has("Island")).toBe(true);
  });

  it("marks total Scryfall failure as failed with stubs", async () => {
    vi.mocked(batchFetchCards).mockResolvedValue(new Map());
    const store = useCardDataStore();

    await store.resolveCards([{ name: "Unknown Card", quantity: 1 }]);

    expect(store.resolutionStatus).toBe("failed");
    expect(store.loadError).toContain("Scryfall did not return card data");
    expect(store.unresolved).toEqual(["Unknown Card"]);
    expect(store.cardRecords.get("Unknown Card")?.typeLine).toBe("");
  });

  it("tracks partial cached data as degraded", async () => {
    vi.mocked(countCachedCards).mockReturnValue(1);
    vi.mocked(batchFetchCards).mockResolvedValue(new Map([["Island", mockCard("Island")]]));
    const store = useCardDataStore();

    await store.resolveCards([
      { name: "Island", quantity: 1 },
      { name: "Unknown Card", quantity: 1 },
    ]);

    expect(store.cachedCount).toBe(1);
    expect(store.requestedCount).toBe(1);
    expect(store.resolutionStatus).toBe("degraded");
    expect(store.resolvedCount).toBe(1);
    expect(store.unresolved).toEqual(["Unknown Card"]);
  });

  it("can continue with stub records", () => {
    const store = useCardDataStore();

    store.continueWithStubRecords([{ name: "Offline Card", quantity: 1 }]);

    expect(store.resolutionStatus).toBe("degraded");
    expect(store.loadError).toContain("Continuing with unresolved cards");
    expect(store.unresolved).toEqual(["Offline Card"]);
  });

  it("resolves deck entries that use an MDFC face name", async () => {
    vi.mocked(batchFetchCards).mockResolvedValue(
      new Map([
        ["Fell the Profane // Fell Mire", mockMdfc()],
        ["Fell the Profane", mockMdfc()],
        ["Fell Mire", mockMdfc()],
      ]),
    );
    const store = useCardDataStore();

    await store.resolveCards([{ name: "Fell the Profane", quantity: 1 }]);

    expect(store.resolutionStatus).toBe("ready");
    expect(store.unresolved).toEqual([]);
    expect(store.cardRecords.get("Fell the Profane")?.name).toBe("Fell the Profane // Fell Mire");
  });
});
