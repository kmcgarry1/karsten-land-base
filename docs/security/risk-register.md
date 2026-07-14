# Security Risk Register

| Risk | Decision | Mitigation and review trigger |
| --- | --- | --- |
| Browser storage is readable by same-origin code and local device users | Accepted | Clear-data control, validation, concise disclosure; revisit if accounts or sensitive metadata are added |
| Scryfall receives card and image requests | Accepted | No-referrer requests, origin allowlists, disclosure; revisit if proxying or offline card data becomes viable |
| Scryfall availability affects resolution | Mitigated | Cache, timeout, bounded retry, degraded mode; review after recurring outages |
| `style-src-attr 'unsafe-inline'` is needed for Vue dynamic style bindings | Accepted | Scripts remain same-origin-only; security guard prohibits dynamic scripts; revisit after removing inline style bindings |
| No runtime telemetry or CSP report endpoint | Accepted | CI alerts, audits, deploy logs, header verification, private reporting; revisit after a production incident or usage growth |
| Third-party build and hosting services can affect releases | Mitigated | MFA, least privilege, protected branch, pinned Actions, SBOM, immutable rollback |

The maintainer reviews this register annually, after security incidents, and when adding a backend, authentication, telemetry, or new external origin.

