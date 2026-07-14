const target = process.argv[2];
if (!target) throw new Error("Usage: npm run security:headers -- https://deployment.example");

const url = new URL(target);
if (url.protocol !== "https:") throw new Error("Security headers must be verified over HTTPS.");

const response = await fetch(url, { redirect: "error" });
if (!response.ok) throw new Error(`Deployment returned HTTP ${response.status}.`);

const expected = new Map([
  ["referrer-policy", "no-referrer"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["cross-origin-opener-policy", "same-origin"],
  ["cross-origin-resource-policy", "same-origin"],
  ["strict-transport-security", "max-age=31536000"],
]);
const failures = [];
for (const [name, value] of expected) {
  if (response.headers.get(name) !== value) failures.push(`${name} did not match ${value}`);
}

const csp = response.headers.get("content-security-policy") ?? "";
for (const directive of [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src https://api.scryfall.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
]) {
  if (!csp.includes(directive)) failures.push(`CSP is missing: ${directive}`);
}

if (failures.length) throw new Error(`Security header verification failed:\n${failures.join("\n")}`);
console.log(`Security headers verified for ${url.origin}.`);
