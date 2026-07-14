# Threat Model

Last reviewed: 13 July 2026

## System and trust boundaries

The product is a static Vue application deployed through Netlify. User-supplied deck text and all `localStorage` values are untrusted. Scryfall API responses and image URLs cross an external-service boundary. Simulation messages cross a Web Worker boundary. npm packages, GitHub Actions, and Netlify form the software supply chain.

There are no accounts, first-party backend, payments, cookies, privileged administrative functions, or application secrets.

## Assets

- Availability and integrity of deck analysis.
- Confidentiality of locally saved decklists within the limits of the browser profile.
- Integrity of the production build, deployment configuration, and dependency lockfile.
- User trust in external links, images, and displayed card data.

## Threats and controls

| Threat | Impact | Primary controls |
| --- | --- | --- |
| Markup or script injection through imports, cache, or Scryfall | Code execution, deceptive UI | Vue text interpolation, no `v-html`, strict script CSP, response validation, CI security guard |
| Malicious remote image URL | Tracking or executable URL load | HTTPS Scryfall host allowlist, no-referrer policy, CSP `img-src` |
| Oversized deck, saved data, or simulation | Browser freeze or storage exhaustion | Shared size limits, simulation work budget, worker timeout and termination |
| Poisoned browser storage | Incorrect analysis or crash | Schema validation, field allowlisting, malformed-key removal, safe defaults |
| Scryfall failure, redirect, or malformed response | Availability loss or incorrect results | Timeout, origin/content-type checks, bounded retries, degraded mode |
| Compromised npm or CI dependency | Build compromise | Lockfile installs, Dependabot, dependency review, npm audit, CodeQL, SHA-pinned Actions, SBOM |
| Deployment-header regression | Increased XSS/clickjacking exposure | Committed Netlify headers and deployed-header verification |
| Repository or hosting account takeover | Malicious release | MFA, least privilege, protected branch, required checks, Netlify rollback |

## Out of scope and accepted boundaries

- A malicious browser extension, compromised device, or another script already executing in the same origin can read local storage.
- Scryfall observes network metadata and requested card/image names.
- Availability ultimately depends on the browser, Netlify, GitHub, npm, and Scryfall.
- The model is reviewed for material architecture changes and at least annually.

