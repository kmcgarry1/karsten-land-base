# Incident and Vulnerability Response

## Triage

1. Preserve the private report, affected deployment URL, CI run, dependency versions, and timestamps.
2. Confirm impact without placing real user deck data into issues or logs.
3. Assign severity and the remediation target from `SECURITY.md`.
4. If active exploitation or build compromise is plausible, stop production publishing and restore the last known-good immutable Netlify deployment.

## Containment and remediation

- Revoke affected GitHub or Netlify sessions/tokens and rotate credentials when account compromise is suspected.
- Patch on a private branch or GitHub security advisory when premature disclosure increases risk.
- Run the complete verification pipeline, audit, SBOM generation, and deployed-header check.
- Deploy only through protected `main`; do not bypass required security checks.

## Recovery and disclosure

- Verify core routes, Scryfall resolution, workers, images, themes, languages, and security headers after deployment.
- Publish a security advisory with affected versions, impact, remediation, and credit when appropriate.
- Record timeline, root cause, corrective actions, evidence links, and any accepted residual risk.
- Add regression tests and update the threat model before closing the incident.

