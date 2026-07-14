# Security Policy

## Supported versions

Security fixes are applied to the latest deployment from the `main` branch. Older deployments and local forks are unsupported.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository. Do not open a public issue containing exploit details, private deck data, credentials, or proof-of-concept payloads.

Include the affected URL or version, impact, reproduction steps, and any suggested mitigation. The maintainer will acknowledge reports within two business days, assess severity, and use the remediation targets below.

| Severity | Remediation target |
| --- | --- |
| Critical | 24 hours |
| High | 7 days |
| Moderate | 30 days |
| Low | Routine maintenance |

These are operational targets, not a bug-bounty promise. This project does not operate a paid bounty programme.

## Security model

The application has no accounts, server-side database, cookies, API secrets, or runtime telemetry. Browser storage is not encrypted. Card names and direct image requests are sent to Scryfall. See the [threat model](docs/security/threat-model.md) and [data inventory](docs/security/data-inventory.md).

