# Render Deployment Guide (GOBINGO)

## Scope
- Backend: persistent Node.js Web Service on Render.
- Frontend: remains on Vercel at `https://gobingo-rho.vercel.app/`.
- Do not scale the backend to multiple instances until game state persistence is redesigned.

## Render Web Service settings
- Service type: Web Service
- Runtime: Node
- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`
- Auto-deploy: optional, from `main`
- Instances: 1 only

The production start command is `npm start`, which runs `node src/index.js`. It does not run `ensurePostgres.js`, nodemon, seeds, or migrations.

## Required backend environment variables
Secrets:
- `DATABASE_URL`
- `JWT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (only when `TELEGRAM_WEBHOOK_URL` is set)
- `TELEBIRR_APP_ID` (when `TELEBIRR_ENV=production`)
- `TELEBIRR_APP_KEY` (when `TELEBIRR_ENV=production`)
- `TELEBIRR_SHORT_CODE` (when `TELEBIRR_ENV=production`)
- `TELEBIRR_NOTIFY_URL` (when `TELEBIRR_ENV=production`)
- `TELEBIRR_WEBHOOK_SECRET`

Public/configuration:
- `NODE_ENV=production`
- `PORT` (Render injects this; app binds `0.0.0.0`)
- `REDIS_URL` (optional)
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_URL` (leave empty for polling on one instance)
- `MINI_APP_URL`
- `TELEBIRR_ENV`
- `TELEBIRR_PUBLIC_KEY`
- `TELEBIRR_BASE_URL`
- `CORS_ORIGINS`
- `DB_SSL`
- `DB_SSL_REJECT_UNAUTHORIZED`
- `PLATFORM_COMMISSION_RATE`
- `AGENT_COMMISSION_RATE`
- `GAME_EXPECTED_PLAYERS`
- `PAYMENT_PROVIDER`
- `ALLOW_MOCK_PAYMENTS=false`

## Database migrations
Apply migrations deliberately before or after deploy:

```bash
npm run migrate
```

This uses Knex and only applies pending migrations. It does not reset, drop, or overwrite data. Do not run seeds in production unless intentionally needed.

## Telegram bot mode
For the initial single-instance deployment, leave `TELEGRAM_WEBHOOK_URL` empty. The backend uses polling and starts the bot once.

If a verified webhook setup is required later, set both `TELEGRAM_WEBHOOK_URL` and `TELEGRAM_WEBHOOK_SECRET`; do not enable polling and webhook at the same time.

## Frontend (Vercel) configuration
Set these in Vercel:
- `VITE_API_URL=https://<your-render-backend-domain>`
- `VITE_BACKEND_URL=https://<your-render-backend-domain>`

The backend must allow the frontend origin:

```text
CORS_ORIGINS=https://gobingo-rho.vercel.app
```

## Health checks
- Liveness: `GET /health` returns `{ ok: true, service: "GOBINGO" }` without secrets.
- Readiness: `GET /ready` checks PostgreSQL.

## Redis and multiplayer state
Redis is optional for a single Render instance. It only enables Socket.IO broadcasting across instances. Game state, including `activeGames`, timers, and drawn numbers, is held in process memory. Therefore:
- state is lost on restart or redeploy;
- state is not shared across multiple instances;
- do not scale horizontally until game state is persisted/shared.

## Unresolved risks
- Telebirr production callback verification remains intentionally fail-closed until official signature details are available.
- Automated payout provider API is unavailable; manual/admin payout workflow remains required.
- Real bot token, production database, and frontend/backend URLs must be provisioned manually.