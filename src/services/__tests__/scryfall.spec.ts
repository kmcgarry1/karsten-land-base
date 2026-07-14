import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  batchFetchCards,
  clearScryfallCache,
  fetchCardByName,
  validateCacheEntry,
} from "../scryfall";

const mdfc = {
  id: "fell-the-profane-id",
  name: "Fell the Profane // Fell Mire",
  type_line: "Instant // Land",
  color_identity: ["B"],
  cmc: 4,
  layout: "modal_dfc",
  card_faces: [
    { name: "Fell the Profane", type_line: "Instant", mana_cost: "{3}{B}", colors: ["B"] },
    {
      name: "Fell Mire",
      type_line: "Land",
      oracle_text: "Fell Mire enters the battlefield tapped.\n{T}: Add {B}.",
      produced_mana: ["B"],
    },
  ],
};

function jsonResponse(body: unknown): Response {
  const serialized = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    url: "https://api.scryfall.com/cards/collection",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => serialized,
  } as Response;
}

describe("Scryfall cache validation", () => {
  beforeEach(() => {
    clearScryfallCache();
    vi.restoreAllMocks();
  });

  it("rejects malformed cache entries", () => {
    expect(validateCacheEntry(null)).toBeNull();
    expect(validateCacheEntry({ ts: "now", card: {} })).toBeNull();
    expect(validateCacheEntry({ ts: Date.now(), card: { name: "Island" } })).toBeNull();
  });

  it("accepts and sanitizes valid cache entries", () => {
    const entry = validateCacheEntry({
      ts: 123,
      card: {
        id: "island-id",
        name: "Island",
        type_line: "Basic Land — Island",
        color_identity: [],
        cmc: 0,
        image_uris: {
          art_crop: "https://cards.scryfall.io/island-art.jpg",
          large: "https://cards.scryfall.io/island-large.jpg",
          normal: "https://cards.scryfall.io/island-normal.jpg",
          png: "ignored",
        },
        extra_field: "ignored",
      },
    });

    expect(entry?.ts).toBe(123);
    expect(entry?.card.name).toBe("Island");
    expect(entry?.card.image_uris?.art_crop).toBe("https://cards.scryfall.io/island-art.jpg");
    expect(entry).not.toBeNull();
    expect("png" in (entry!.card.image_uris as Record<string, unknown>)).toBe(false);
    expect("extra_field" in (entry!.card as unknown as Record<string, unknown>)).toBe(false);
  });

  it("maps MDFC face names returned by collection lookup", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: [mdfc] }));

    const cards = await batchFetchCards(["Fell the Profane"]);

    expect(cards.get("Fell the Profane")?.name).toBe("Fell the Profane // Fell Mire");
    expect(cards.get("Fell Mire")?.name).toBe("Fell the Profane // Fell Mire");
  });

  it("looks up double-faced export names by their front face", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: [mdfc] }));

    const cards = await batchFetchCards(["Fell the Profane // Fell Mire"]);
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);

    expect(request.identifiers).toEqual([{ name: "Fell the Profane" }]);
    expect(cards.get("Fell the Profane // Fell Mire")?.name).toBe("Fell the Profane // Fell Mire");
  });

  it("rejects non-JSON responses and unapproved redirects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ...jsonResponse(mdfc),
      headers: new Headers({ "content-type": "text/html" }),
    } as Response);
    await expect(fetchCardByName("Island")).resolves.toBeNull();

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ...jsonResponse(mdfc),
      url: "https://evil.example/card",
    } as Response);
    await expect(fetchCardByName("Mountain")).resolves.toBeNull();
  });

  it("aborts requests after the safety timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    );
    const request = fetchCardByName("Plains");
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(request).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("limits collection results to the requested batch and drops malformed cards", async () => {
    const extra = Array.from({ length: 80 }, (_, index) => ({ ...mdfc, id: `id-${index}` }));
    extra.push({ name: "malformed" } as typeof mdfc);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: extra }));
    const cards = await batchFetchCards(["Fell the Profane"]);
    expect(cards.get("Fell the Profane")?.id).toBe("id-0");
    expect([...cards.values()].every((card) => card.id !== undefined)).toBe(true);
  });
});
