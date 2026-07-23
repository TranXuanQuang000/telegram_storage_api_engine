# Deployment readiness

Status: ready for private production deployment

- Successful production build is present in `dist/`.
- D1 migration is present in `drizzle/` and the logical binding is `DB`.
- Hosting metadata is present in `.openai/hosting.json`.
- No secret is committed; BYOK keys remain browser-session only.
- `INGEST_TOKEN` is configured as a production secret during deployment.
- Validation, security audit and Visual Quality Gate are complete.

