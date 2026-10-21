# Contributing to the NIWIS frontend

Thank you for helping. NIWIS is the Department of Water and Sanitation's public water information system; this
repository is its web dashboard. Data come from the read-only NIWIS API (companion repository `Niwis-Backend`).

## Ground rules

1. **Never show an invented number as real.** A panel shows data from the API (marked **Live**), sample data clearly
   marked **Sample** (development and test builds only), or "Not yet available" with the API's reason. Production
   builds (`npm run build:release`) contain no sample data.
2. **Labels and units come from the database catalogue** served by the API (`/{module}/categories`); one unit per
   chart axis.
3. **The system is public with no login.** Do not add user accounts, roles or anything stored per user on a server.
4. **Accessibility is a requirement:** WCAG 2.1 AA (the axe tests run in light and dark themes), keyboard access, and
   layouts that work from 390 px to 1920 px wide.
5. **No secrets** in code, tests, fixtures, `.env.*` files that are committed, or CI workflows. Only `VITE_` settings
   that are safe to publish belong in the committed `.env.example`, `.env.fixtures`, `.env.live` and `.env.release`.

## Setup

```bash
npm ci
npm run dev                     # mock API with sample data, http://localhost:5173
npm run dev:live                # hybrid: live modules from a local backend on :8000
npx playwright install chromium # once, for the end-to-end tests
```

## Before you open a pull request

```bash
npm run verify        # typecheck, lint, prettier --check, unit tests, builds, generated docs
npm run test:e2e      # mock smoke test of every route, hybrid pages from recorded fixtures, backend-down errors
```

The same checks run in CI (`.github/workflows/ci.yml`) without secrets and without a backend: the hybrid tests use the
recorded API responses in `tests/fixtures/backend`. If you change what a live page requests, re-record them against a
local backend (`npm run fixtures:record`, see `README.md`) and run `npm run contract:check`.

## Commits and pull requests

Small, focused commits with a message that says what changed and why. For visual changes, include before / after
screenshots at 1440 px and 390 px. By contributing you agree that your contribution may be published under the licence
DWS confirms for this project (see `README.md`, "Licence").
