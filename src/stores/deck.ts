import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  DeckEntry,
  ParsedDecklist,
  CommanderInfo,
  CardRecord,
  MtgColour,
} from "../domain/types";
import { ALL_COLOURS } from "../domain/types";
import { SECURITY_LIMITS, isDeckTextWithinLimits } from "../security/limits";
import { isSafeCardName } from "../security/validation";

// ─── Deck text parser ─────────────────────────────────────────────────────────

const COMMANDER_SECTION_RE = /^commander[s]?\s*$/i;
const ENTRY_RE = /^\s*(\d+)x?\s+(.+?)\s*$/;
const SET_COLLECTOR_RE = /\s+\([A-Z0-9]{2,6}\)\s*[\w-]*\s*$/i;

/**
 * Parse raw decklist text in MTGO/Moxfield/Archidekt/CubeCobra format.
 *
 * Supported formats:
 *   1 Island
 *   4x Lightning Bolt
 *   // Commander section header
 *   1 Muldrotha, the Gravetide *CMDR*
 */
export function parseDecklist(text: string): ParsedDecklist {
  if (!isDeckTextWithinLimits(text)) {
    return {
      entries: [],
      commanderEntries: [],
      deckEntries: [],
      rawText: "",
      errors: [
        `Decklist exceeds the ${SECURITY_LIMITS.deckTextCharacters.toLocaleString()} character or ${SECURITY_LIMITS.deckLines.toLocaleString()} line limit.`,
      ],
      duplicateNames: [],
      sections: [],
    };
  }
  const lines = text.split("\n");
  const entries: DeckEntry[] = [];
  const commanderEntries: DeckEntry[] = [];
  const deckEntries: DeckEntry[] = [];
  const errors: string[] = [];
  const sections = new Set<string>();

  let inCommanderSection = false;

  // Known non-`//` section headers (e.g. Moxfield/Archidekt style)
  const SECTION_HEADER_RE = /^(mainboard|sideboard|maybeboard|commander[s]?)$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Blank lines reset section context
    if (!line) {
      inCommanderSection = false;
      continue;
    }

    if (line.startsWith("//")) {
      // Check if it's a section header like "// Commander"
      const section = line.replace(/^\/\/\s*/, "").trim();
      if (section) sections.add(section);
      if (COMMANDER_SECTION_RE.test(section)) {
        inCommanderSection = true;
      } else {
        inCommanderSection = false;
      }
      continue;
    }

    // Non-`//` section headers (e.g. "Mainboard", "Commander")
    if (SECTION_HEADER_RE.test(line)) {
      sections.add(line);
      inCommanderSection = /^commander[s]?$/i.test(line);
      continue;
    }

    const match = ENTRY_RE.exec(line);
    if (!match) {
      errors.push(`Could not parse line: "${line}"`);
      continue;
    }

    const quantity = parseInt(match[1]!, 10);
    const originalName = match[2]!.trim();
    let name = normalizeDeckCardName(originalName);

    if (
      !Number.isInteger(quantity) ||
      quantity < SECURITY_LIMITS.cardQuantityMin ||
      quantity > SECURITY_LIMITS.cardQuantityMax
    ) {
      errors.push(`Invalid quantity on line: "${line.slice(0, 300)}"`);
      continue;
    }

    // Handle "*CMDR*" or "(Commander)" suffixes
    const isCommanderSuffix = /\*CMDR\*|\(Commander\)/i.test(originalName);
    name = name
      .replace(/\s*\*CMDR\*\s*/i, "")
      .replace(/\s*\(Commander\)\s*/i, "")
      .trim();

    if (!isSafeCardName(name)) {
      errors.push(`Invalid card name on line: "${line.slice(0, 300)}"`);
      continue;
    }

    if (entries.length >= SECURITY_LIMITS.deckEntries) {
      errors.push(`Decklist exceeds the ${SECURITY_LIMITS.deckEntries} entry limit.`);
      break;
    }

    const isCommander = inCommanderSection || isCommanderSuffix;
    const entry: DeckEntry = {
      quantity,
      name,
      originalName,
      lookupName: lookupNameForCardName(name),
      isCommander,
    };
    entries.push(entry);

    if (isCommander) commanderEntries.push(entry);
    else deckEntries.push(entry);
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) duplicates.add(entry.name);
    seen.add(key);
  }

  return {
    entries,
    commanderEntries,
    deckEntries,
    rawText: text,
    errors,
    duplicateNames: [...duplicates],
    sections: [...sections],
  };
}

export function normalizeDeckCardName(rawName: string): string {
  return rawName
    .replace(/\s+#.*$/, "")
    .replace(/\s+\[[^\]]+\]\s*$/i, "")
    .replace(/\s+\{[^}]+\}\s*$/i, "")
    .replace(/\s+\*[^*]+\*\s*$/i, "")
    .replace(SET_COLLECTOR_RE, "")
    .replace(/\s*\*CMDR\*\s*/i, "")
    .replace(/\s*\(Commander\)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupNameForCardName(name: string): string {
  return name.split(/\s+\/\/\s+/)[0]?.trim() || name;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDeckStore = defineStore("deck", () => {
  const rawText = ref("");
  const parsed = ref<ParsedDecklist | null>(null);
  const cards = ref<CardRecord[]>([]);
  const commanderInfo = ref<CommanderInfo | null>(null);
  const deckName = ref("");
  const isLoading = ref(false);
  const loadErrors = ref<string[]>([]);

  const totalCards = computed(() =>
    cards.value.reduce((s, c) => s + (c.isCommander ? 0 : c.quantity), 0),
  );

  const landCount = computed(() =>
    cards.value
      .filter((c) => !c.isCommander && c.typeLine.toLowerCase().includes("land"))
      .reduce((s, c) => s + c.quantity, 0),
  );

  const colourIdentity = computed<MtgColour[]>(() => commanderInfo.value?.colourIdentity ?? []);

  const commanders = computed(() => cards.value.filter((c) => c.isCommander));

  function setRawText(text: string) {
    rawText.value = text;
    parsed.value = parseDecklist(text);
  }

  function setCommanderEntries(names: string[]) {
    if (!parsed.value) return;
    const selected = new Set(names.map((name) => name.toLowerCase()));
    const entries = parsed.value.entries.map((entry) => ({
      ...entry,
      isCommander: selected.has(entry.name.toLowerCase()),
    }));
    parsed.value = {
      ...parsed.value,
      entries,
      commanderEntries: entries.filter((entry) => entry.isCommander),
      deckEntries: entries.filter((entry) => !entry.isCommander),
    };
  }

  function setCards(newCards: CardRecord[]) {
    cards.value = newCards;
  }

  function setCommanderInfo(info: CommanderInfo) {
    commanderInfo.value = info;
  }

  function resolveCommanderInfo(commanderCards: CardRecord[]): CommanderInfo {
    const names = commanderCards.map((c) => c.name);
    const allColours = new Set<MtgColour>();
    for (const c of commanderCards) {
      for (const col of c.colourIdentity) {
        if (ALL_COLOURS.includes(col)) allColours.add(col);
      }
    }
    // Sort by WUBRG order
    const identity: MtgColour[] = ALL_COLOURS.filter((c) => allColours.has(c));
    const count = commanderCards.length;
    const librarySize = count >= 2 ? 98 : 99;
    return { names, colourIdentity: identity, count, librarySize };
  }

  function autoResolveCommander() {
    const cmdCards = cards.value.filter((c) => c.isCommander);
    if (cmdCards.length > 0) {
      commanderInfo.value = resolveCommanderInfo(cmdCards);
    }
  }

  function clearPreparedData() {
    cards.value = [];
    commanderInfo.value = null;
  }

  function clear() {
    rawText.value = "";
    parsed.value = null;
    cards.value = [];
    commanderInfo.value = null;
    deckName.value = "";
    loadErrors.value = [];
  }

  return {
    rawText,
    parsed,
    cards,
    commanderInfo,
    deckName,
    isLoading,
    loadErrors,
    totalCards,
    landCount,
    colourIdentity,
    commanders,
    setRawText,
    setCommanderEntries,
    setCards,
    setCommanderInfo,
    resolveCommanderInfo,
    autoResolveCommander,
    clearPreparedData,
    clear,
  };
});
