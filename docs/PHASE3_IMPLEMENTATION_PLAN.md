# Phase 3 Implementation Plan

## Current architecture
- Backend: Express + Socket.IO, PostgreSQL via Knex, optional Redis adapter/store.
- Frontend: Vite React app served by Nginx, API base from `VITE_API_URL`.
- Payments: Telebirr sandbox mock flow plus production skeleton.
- Games: server draws numbers; claims validated server-side; payout service settles rooms.

## Verified baseline
- Backend tests: 8 suites, 24 tests passing after Phase 3 changes.
- Frontend production build: passing.
- PostgreSQL: available locally on port 5432.
- Redis: unavailable locally; in-memory fallback used.
- Docker Compose configuration: valid (`docker compose config --quiet`, exit 0).
- Dependency audit: 0 vulnerabilities; external `uuid` dependency removed in favor of Node `crypto.randomUUID()`.

## Implemented in this phase
- Environment validation at startup.
- Production-safe dev auth bypass.
- Restrictive production CORS.
- Route-level rate limits.
- Error responses without stack traces.
- Telebirr production callback fail-closed signature handling.
- Exact six-player payout arithmetic and duplicate settlement protection.
- Redis production policy and connection timeouts.
- Docker health checks, restart policies, ignores.
- CI workflow.

## Known blockers
- Official Telebirr signature canonical format and production credentials are unavailable; production callbacks are intentionally rejected until verified.
- Automated payout provider API is unavailable; manual/admin payout workflow remains required for production disbursement.
- Redis is not installed locally; fallback is development-only.

## Remaining manual steps
- Provide production secrets and CORS origins.
- Verify Telebirr merchant integration in sandbox/production.
- Configure backups, monitoring, TLS, and deployment approvals.