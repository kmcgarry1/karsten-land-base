import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const root = lock.packages?.[""] ?? {};

function packageName(path) {
  return path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
}

function purl(name, version) {
  const encodedName = name.startsWith("@")
    ? name.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function integrityHash(integrity) {
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) return undefined;
  return {
    alg: "SHA-512",
    content: Buffer.from(integrity.slice("sha512-".length), "base64").toString("hex"),
  };
}

const componentList = Object.entries(lock.packages ?? {})
  .filter(([path, pkg]) => path.includes("node_modules/") && pkg.version)
  .map(([path, pkg]) => {
    const name = packageName(path);
    const component = {
      type: "library",
      "bom-ref": purl(name, pkg.version),
      name,
      version: pkg.version,
      purl: purl(name, pkg.version),
      scope: pkg.dev ? "optional" : "required",
    };
    if (pkg.license) component.licenses = [{ license: { id: pkg.license } }];
    const hash = integrityHash(pkg.integrity);
    if (hash) component.hashes = [hash];
    return component;
  })
  .sort((left, right) => left.purl.localeCompare(right.purl));
const components = [...new Map(componentList.map((component) => [component["bom-ref"], component])).values()];

const document = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: { components: [{ type: "application", name: "commander-land-base-sbom-generator", version: "1" }] },
    component: {
      type: "application",
      name: lock.name ?? "commander-land-base",
      version: lock.version ?? "0.0.0",
      "bom-ref": `pkg:npm/${encodeURIComponent(lock.name ?? "commander-land-base")}@${encodeURIComponent(lock.version ?? "0.0.0")}`,
      properties: [
        { name: "security:lockfileVersion", value: String(lock.lockfileVersion ?? "unknown") },
        { name: "security:productionDependencies", value: String(Object.keys(root.dependencies ?? {}).length) },
      ],
    },
  },
  components,
};

process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
