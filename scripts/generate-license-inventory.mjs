import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const inventory = Object.entries(lock.packages ?? {})
  .filter(([path]) => path.startsWith("node_modules/"))
  .map(([path, pkg]) => ({
    name: path.slice("node_modules/".length),
    version: pkg.version ?? "unknown",
    license: pkg.license ?? "UNKNOWN",
    development: Boolean(pkg.dev),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), packages: inventory }, null, 2)}\n`);
