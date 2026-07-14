# Security Control Matrix

This matrix maps implemented outcomes to NIST SP 800-218 SSDF practice groups. It is implementation evidence, not a certification statement.

| SSDF area | Implemented control | Evidence |
| --- | --- | --- |
| PO: Prepare | Security requirements, threat model, remediation targets, release criteria | Security documentation and `SECURITY.md` |
| PS: Protect | Protected branch, least privilege, MFA, locked build, SHA-pinned Actions | Repository checklist, workflows, lockfile |
| PW: Produce | Boundary validation, CSP, safe remote URLs, resource limits, automated tests | `src/security`, `netlify.toml`, test suite |
| PW: Verify | Lint, type-check, unit tests, build, CodeQL, dependency review, audit | Required GitHub checks and CI evidence |
| RV: Respond | Private reporting, severity targets, incident process, rollback | `SECURITY.md`, playbook, Netlify deploy history |
| Supply chain | SBOM, license inventory, Dependabot, lockfile review | CI artifacts and Dependabot PRs |

## Operator-only controls

The repository owner must enable GitHub private vulnerability reporting, secret scanning, push protection, branch protection with all security checks required, and MFA. Netlify access must use MFA and least privilege, and production deploys must originate only from protected `main`.

