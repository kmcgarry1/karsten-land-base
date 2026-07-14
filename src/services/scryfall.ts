import type { CardRecord, ScryfallCard, MtgColour, MtgColourOrColourless } from "../domain/types";
import { ALL_COLOURS } from "../domain/types";
import { SECURITY_LIMITS } from "../security/limits";
import { CARD_CACHE_PREFIX, removeStorageKey } from "../security/storage";
import { isAllowedScryfallResponseUrl, safeScryfallImageUrl } from "../security/urls";
import { isPlainRecord, isSafeCardName } from "../security/validation";
import { SecurityServiceError } from "../security/errors";

const BASE_URL = "https://api.scryfall.com";
const CACHE_KEY_PREFIX = CARD_CACHE_PREFIX;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SCRYFALL_REQUEST_DELAY_MS = 120;
const SCRYFALL_RETRY_DELAY_MS = 900;
const SCRYFALL_MAX_ATTEMPTS = 2;
const CACHE_MAX_ENTRIES = 300;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_CHARACTERS = 5_000_000;

export type ScryfallErrorCode =
  | "timeout"
  | "rate-limit"
  | "invalid-response"
  | "blocked-url"
  | "network";

export class ScryfallServiceError extends SecurityServiceError {
  constructor(code: ScryfallErrorCode, message: string) {
    super(code, message);
    this.name = "ScryfallServiceError";
  }
}

interface CacheEntry {
  card: ScryfallCard;
  ts: number;
}

function cacheGet(name: string): ScryfallCard | null {
  try {
    const key = CACHE_KEY_PREFIX + name.toLowerCase();
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = validateCacheEntry(JSON.parse(raw));
    if (!entry) {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.card;
  } catch {
    removeStorageKey(CACHE_KEY_PREFIX + name.toLowerCase());
    return null;
  }
}

function cacheSet(name: string, card: ScryfallCard): void {
  try {
    const entry: CacheEntry = { card: sanitizeScryfallCard(card), ts: Date.now() };
    localStorage.setItem(CACHE_KEY_PREFIX + name.toLowerCase(), JSON.stringify(entry));
    enforceCacheLimit();
  } catch {
    // A full or unavailable store must not erase otherwise valid cached records.
  }
}

export function validateCacheEntry(value: unknown): CacheEntry | null {
  if (!isPlainRecord(value)) return null;
  const entry = value as Partial<CacheEntry>;
  if (typeof entry.ts !== "number" || !Number.isFinite(entry.ts)) return null;
  if (!entry.card || typeof entry.card !== "object") return null;
  const card = validateScryfallCard(entry.card);
  if (!card) return null;
  return { card, ts: entry.ts };
}

export function validateScryfallCard(value: unknown): ScryfallCard | null {
  const card = value as Partial<ScryfallCard>;
  if (
    !isPlainRecord(card) ||
    typeof card.id !== "string" ||
    card.id.length < 1 ||
    card.id.length > 128 ||
    !isSafeCardName(card.name) ||
    typeof card.type_line !== "string" ||
    card.type_line.length > 1_000 ||
    !Array.isArray(card.color_identity) ||
    card.color_identity.length > 5 ||
    !card.color_identity.every((colour) => typeof colour === "string" && colour.length === 1) ||
    typeof card.cmc !== "number" ||
    !Number.isFinite(card.cmc) ||
    card.cmc < 0 ||
    card.cmc > 1_000
  ) {
    return null;
  }
  return sanitizeScryfallCard(card as ScryfallCard);
}

function sanitizeScryfallCard(card: ScryfallCard): ScryfallCard {
  const faces = Array.isArray(card.card_faces)
    ? card.card_faces.slice(0, 4).flatMap((face) => {
        if (!isPlainRecord(face) || !isSafeCardName(face.name) || typeof face.type_line !== "string") {
          return [];
        }
        return [{
          name: face.name,
          type_line: boundedText(face.type_line, 1_000) ?? "",
          mana_cost: boundedText(face.mana_cost, 1_000),
          oracle_text: boundedText(face.oracle_text),
          colors: safeStringArray(face.colors, 5, 1),
          produced_mana: safeStringArray(face.produced_mana, 6, 1),
          image_uris: sanitizeImageUris(face.image_uris),
        }];
      })
    : undefined;
  return {
    id: card.id,
    name: card.name,
    type_line: boundedText(card.type_line, 1_000) ?? "",
    mana_cost: boundedText(card.mana_cost, 1_000),
    oracle_text: boundedText(card.oracle_text),
    color_identity: safeStringArray(card.color_identity, 5, 1) ?? [],
    cmc: typeof card.cmc === "number" ? card.cmc : 0,
    card_faces: faces,
    image_uris: sanitizeImageUris(card.image_uris),
    produced_mana: safeStringArray(card.produced_mana, 6, 1),
    layout: boundedText(card.layout, 100),
  };
}

function sanitizeImageUris(imageUris: ScryfallCard["image_uris"]): ScryfallCard["image_uris"] {
  if (!imageUris) return undefined;
  const sanitized = {
    art_crop: safeScryfallImageUrl(imageUris.art_crop),
    large: safeScryfallImageUrl(imageUris.large),
    normal: safeScryfallImageUrl(imageUris.normal),
  };
  return Object.values(sanitized).some(Boolean) ? sanitized : undefined;
}

function boundedText(
  value: unknown,
  max: number = SECURITY_LIMITS.remoteTextCharacters,
): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

function safeStringArray(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, maxItems)
    .filter((item): item is string => typeof item === "string" && item.length <= maxLength);
}

function enforceCacheLimit(): void {
  const entries: Array<{ key: string; ts: number }> = [];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CACHE_KEY_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    let entry: CacheEntry | null = null;
    try {
      entry = raw ? validateCacheEntry(JSON.parse(raw)) : null;
    } catch {
      entry = null;
    }
    if (!entry) {
      localStorage.removeItem(key);
      continue;
    }
    entries.push({ key, ts: entry.ts });
  }

  if (entries.length <= CACHE_MAX_ENTRIES) return;
  entries
    .sort((a, b) => a.ts - b.ts)
    .slice(0, entries.length - CACHE_MAX_ENTRIES)
    .forEach((entry) => localStorage.removeItem(entry.key));
}

export function countCachedCards(names: string[]): number {
  return names.filter((name) => cachedCardForName(name)).length;
}

export function clearScryfallCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures; callers can still retry network resolution.
  }
}

/** Fetch a single card by exact name from Scryfall (with local cache). */
export async function fetchCardByName(name: string): Promise<ScryfallCard | null> {
  if (!isSafeCardName(name)) return null;
  const cached = cacheGet(name);
  if (cached) return cached;

  try {
    const url = `${BASE_URL}/cards/named?exact=${encodeURIComponent(name)}`;
    const card = validateScryfallCard(await requestJson(url));
    if (!card) return null;
    cacheSet(name, card);
    return card;
  } catch {
    return null;
  }
}

/** Search Scryfall with a query string. Returns up to 175 cards (first page). */
export async function searchCards(query: string): Promise<ScryfallCard[]> {
  if (typeof query !== "string" || query.length < 1 || query.length > 512) return [];
  try {
    const url = `${BASE_URL}/cards/search?q=${encodeURIComponent(query)}&order=name`;
    const response = await requestJson(url);
    if (!isPlainRecord(response) || !Array.isArray(response.data)) return [];
    return response.data.slice(0, 175).flatMap((card) => {
      const validated = validateScryfallCard(card);
      return validated ? [validated] : [];
    });
  } catch {
    return [];
  }
}

/** Search for lands playable in a given colour identity. */
export async function searchLandsForIdentity(colours: MtgColour[]): Promise<ScryfallCard[]> {
  const identityFilter = `id<=${colours.join("")}`;
  return searchCards(`t:land ${identityFilter} f:edh`);
}

/** Batch-fetch cards by name. Returns a map of name → ScryfallCard. */
export async function batchFetchCards(
  names: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ScryfallCard>> {
  const result = new Map<string, ScryfallCard>();
  const toFetch: string[] = [];

  for (const name of names) {
    if (!isSafeCardName(name)) continue;
    const cached = cachedCardForName(name);
    if (cached) mapCardAliases(result, cached);
    else toFetch.push(scryfallLookupName(name));
  }

  // Scryfall collection endpoint: up to 75 names per request
  const chunks = chunk(toFetch, 75);
  let done = names.length - toFetch.length;

  for (const [index, batch] of chunks.entries()) {
    const data = await fetchCollectionBatch(batch);
    if (data) {
      for (const card of data) {
        mapCardAliases(result, card);
        cacheSet(card.name, card);
      }
    }

    done += batch.length;
    onProgress?.(done, names.length);

    if (index < chunks.length - 1) await sleep(SCRYFALL_REQUEST_DELAY_MS);
  }

  return result;
}

function mapCardAliases(result: Map<string, ScryfallCard>, card: ScryfallCard): void {
  result.set(card.name, card);
  for (const face of card.card_faces ?? []) {
    if (face.name) result.set(face.name, card);
  }
}

function cachedCardForName(name: string): ScryfallCard | null {
  const lookupName = scryfallLookupName(name);
  return cacheGet(name) ?? cacheGet(lookupName) ?? cacheFindByFaceName(name) ?? cacheFindByFaceName(lookupName);
}

function scryfallLookupName(name: string): string {
  return name.split(/\s+\/\/\s+/)[0]?.trim() || name;
}

function cacheFindByFaceName(name: string): ScryfallCard | null {
  try {
    const normalized = name.toLowerCase();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CACHE_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      let entry: CacheEntry | null = null;
      try {
        entry = raw ? validateCacheEntry(JSON.parse(raw)) : null;
      } catch {
        removeStorageKey(key);
      }
      if (!entry) continue;
      if (entry.card.card_faces?.some((face) => face.name.toLowerCase() === normalized)) {
        return entry.card;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchCollectionBatch(names: string[]): Promise<ScryfallCard[] | null> {
  for (let attempt = 1; attempt <= SCRYFALL_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await requestJson(`${BASE_URL}/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifiers: names.map((name) => ({ name })),
        }),
      });
      if (!isPlainRecord(response) || !Array.isArray(response.data)) return [];
      return response.data.slice(0, names.length).flatMap((card) => {
        const validated = validateScryfallCard(card);
        return validated ? [validated] : [];
      });
    } catch (error) {
      if (
        error instanceof ScryfallServiceError &&
        error.code !== "rate-limit" &&
        error.code !== "network" &&
        error.code !== "timeout"
      ) {
        return [];
      }
      // Browsers surface Scryfall 503/429 CORS-less responses as network failures.
      // Do not fan out to per-card requests here; that amplifies rate limiting.
    }

    if (attempt < SCRYFALL_MAX_ATTEMPTS) await sleep(SCRYFALL_RETRY_DELAY_MS * attempt);
  }

  return null;
}

async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ScryfallServiceError(
        response.status === 429 ? "rate-limit" : "network",
        response.status === 429 ? "Scryfall rate limited the request." : "Scryfall request failed.",
      );
    }
    if (response.url && !isAllowedScryfallResponseUrl(response.url)) {
      throw new ScryfallServiceError("blocked-url", "Scryfall redirected to an unapproved origin.");
    }
    const contentType = response.headers?.get?.("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new ScryfallServiceError("invalid-response", "Scryfall returned a non-JSON response.");
    }
    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) {
      throw new ScryfallServiceError("invalid-response", "Scryfall response exceeded the safety limit.");
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ScryfallServiceError("invalid-response", "Scryfall returned malformed JSON.");
    }
  } catch (error) {
    if (error instanceof ScryfallServiceError) throw error;
    if (controller.signal.aborted) {
      throw new ScryfallServiceError("timeout", "Scryfall request timed out.");
    }
    throw new ScryfallServiceError("network", "Scryfall could not be reached.");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/** Convert a ScryfallCard to our domain CardRecord. */
export function scryfallToCardRecord(card: ScryfallCard, quantity = 1): CardRecord {
  const colourIdentity = (card.color_identity ?? [])
    .filter((c): c is string => ALL_COLOURS.includes(c as MtgColour))
    .map((c) => c as MtgColour);

  const faces = card.card_faces?.map((f) => ({
    name: f.name,
    typeLine: f.type_line ?? "",
    manaCost: f.mana_cost,
    oracleText: f.oracle_text,
    colours: (f.colors ?? [])
      .filter((c) => ALL_COLOURS.includes(c as MtgColour))
      .map((c) => c as MtgColour),
    producedMana: toProducedMana(f.produced_mana),
    imageUris: toDomainImageUris(f.image_uris),
  }));

  return {
    scryfallId: card.id,
    name: card.name,
    typeLine: card.type_line ?? "",
    manaCost: card.mana_cost,
    oracleText: card.oracle_text,
    colourIdentity,
    cmc: card.cmc ?? 0,
    imageUris: toDomainImageUris(card.image_uris ?? card.card_faces?.[0]?.image_uris),
    faces,
    producedMana: toProducedMana(card.produced_mana),
    quantity,
  };
}

function toProducedMana(value: string[] | undefined): MtgColourOrColourless[] | undefined {
  if (!value) return undefined;
  const valid = new Set<MtgColourOrColourless>([...ALL_COLOURS, "C"]);
  return value.filter((mana): mana is MtgColourOrColourless =>
    valid.has(mana as MtgColourOrColourless),
  );
}

function toDomainImageUris(imageUris: ScryfallCard["image_uris"]): CardRecord["imageUris"] {
  if (!imageUris) return undefined;
  return {
    artCrop: imageUris.art_crop,
    large: imageUris.large,
    normal: imageUris.normal,
  };
}

/** Attempt to infer commander(s) from a parsed deck name list. */
export async function inferCommanders(names: string[]): Promise<string[]> {
  const commanders: string[] = [];
  for (const name of names.slice(0, 5)) {
    const card = await fetchCardByName(name);
    if (!card) continue;
    const types = (card.type_line ?? "").toLowerCase();
    if (
      types.includes("legendary") &&
      (types.includes("creature") || types.includes("planeswalker"))
    ) {
      commanders.push(card.name);
      if (commanders.length >= 2) break;
    }
  }
  return commanders;
}
