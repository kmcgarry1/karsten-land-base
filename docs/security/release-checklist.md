# Secure Release Checklist

- [ ] Change scope and security impact reviewed.
- [ ] `npm ci` used with the committed lockfile.
- [ ] Lint, type-check, unit tests, security guard, and production build passed.
- [ ] Dependency review, CodeQL, and high/critical npm audit checks passed.
- [ ] CycloneDX SBOM and dependency-license inventory retained with the release.
- [ ] No secrets or private deck data appear in source, artifacts, logs, or source maps.
- [ ] Vercel preview passes route, worker, Scryfall, image, language, and theme smoke tests.
- [ ] `npm run security:headers -- <preview-url>` passed.
- [ ] Risk decisions and reviewer identity recorded in the pull request.
- [ ] Production URL and previous known-good Vercel rollback reference recorded.
- [ ] Production header verification passed after deployment.

Release evidence is retained for at least 90 days through CI artifacts and the associated pull request/release record.
