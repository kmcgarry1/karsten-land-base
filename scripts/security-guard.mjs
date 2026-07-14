import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const extensions = new Set([".ts", ".vue", ".js"]);
const forbidden = [
  { pattern: /\bv-html\s*=/, label: "v-html" },
  { pattern: /\.innerHTML\s*=/, label: "innerHTML assignment" },
  { pattern: /insertAdjacentHTML\s*\(/, label: "insertAdjacentHTML" },
  { pattern: /createElement\s*\(\s*["']script["']/, label: "dynamic script creation" },
];
const allowedOrigins = new Set([
  "https://api.scryfall.com",
  "https://cards.scryfall.io",
  "https://svgs.scryfall.io",
  "https://scryfall.com",
]);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return nested.flat();
}

const violations = [];
for (const file of await files(sourceRoot)) {
  if (!extensions.has(extname(file)) || file.includes("/__tests__/")) continue;
  const content = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) violations.push(`${relative(root, file)}: ${rule.label}`);
  }
  for (const match of content.matchAll(/https:\/\/[^\s"'`)]+/g)) {
    try {
      const origin = new URL(match[0]).origin;
      if (!allowedOrigins.has(origin)) {
        violations.push(`${relative(root, file)}: unreviewed origin ${origin}`);
      }
    } catch {
      violations.push(`${relative(root, file)}: malformed HTTPS URL`);
    }
  }
}

if (violations.length) {
  throw new Error(`Security guard failed:\n${violations.join("\n")}`);
}
console.log("Security guard passed.");
