# GOBINGO — Tech Context

## Runtime & Tooling
- Node.js 22.x (required by `backend/package.json` engines).
- npm (use `npm ci`; do not edit lockfiles).
- Jest for backend tests; Vite for frontend.

## Backend Stack
- Express 4
- Socket.IO 4
- Knex + pg (PostgreSQL)
- ioredis / redis adapter
- bcryptjs, jsonwebtoken
- telegraf (Telegram bot)
- helmet, cors, express-rate-limit

## Frontend Stack
- React 18
- Vite 5
- Tailwind CSS
- socket.io-client
- @twa-dev/sdk

## Local Development
- Backend: `cd backend && npm ci && npm run dev` (ensures Postgres).
- Frontend: `cd frontend && npm ci && npm run dev`.
- Migrations: `cd backend && npm run migrate`.
- Tests: `cd backend && npm test`.

## Configuration
- Environment files: `backend/.env`, `backend/.env.example`,
  `backend/.env.production.example`. Never commit real secrets.
- Key env vars: `NODE_ENV`, `TELEGRAM_BOT_TOKEN`, `CORS_ORIGINS`,
  `DRAW_INTERVAL_MS`, `GAME_MAX_PLAYERS`, `REFUND_GRACE_MS`,
  `REGISTRATION_DURATION_MS`, `GAME_WINNING_PATTERNS`, `MAX_SELECTABLE_PATTERNS`,
  `DATABASE_URL`, Redis settings.

## Constraints
- Do not run migrations against production databases.
- Do not install/update dependencies; use `npm ci` only.
- Work in small steps and validate changes.

## Ethio Bingo Implementation Targets
- Card pool validation: `1..400` in `backend/src/routes/rooms.js`.
- Pattern defaults/allow-lists in `backend/src/utils/claimValidator.js`.
- Settlement split logic in `backend/src/services/payoutService.js`.
- Frontend card board rendering and pattern picker alignment.
