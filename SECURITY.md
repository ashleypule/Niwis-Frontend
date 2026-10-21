# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through GitHub's private
vulnerability reporting: on this repository, open **Security → Report a vulnerability**. Include what you found, how to
reproduce it and its impact. You will get an acknowledgement, and a fix or an explanation, as soon as possible.
Problems in the API belong to the backend repository (`Niwis-Backend`), which has its own policy.

## What the frontend does

NIWIS is a **public** system with **no login**: the dashboard holds no user data and sends no credentials. It reads
public data from the NIWIS API with `GET` requests and validates every response against its schema before use.

- No secrets are in the repository; the full git history was scanned with gitleaks (no leaks, 2026-10-21) and CI
  scans every push (`.gitleaks.toml`).
- Production builds (`npm run build:release`) contain no mock service worker and no sample data.
- The production nginx configuration (`deploy/nginx.conf`) sets a Content Security Policy, `nosniff`, frame denial and
  a strict referrer policy.
- Shipped dependencies are audited in CI (`npm audit --omit=dev`: no known vulnerabilities, 2026-10-21, after
  upgrading ECharts to 6.1 for GHSA-fgmj-fm8m-jvvx).

## Supported versions

Only the `master` branch is maintained; fixes are made there.
