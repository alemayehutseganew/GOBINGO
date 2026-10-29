# GOBINGO / Ethio Bingo

Real-time multiplayer Ethio Bingo (Telegram Mini App).

## Prerequisites
- Node.js 22.x
- PostgreSQL
- Redis (optional for local dev)

## Backend
```bash
cd backend
npm ci
cp .env.example .env
# update .env values
npm run migrate
npm run dev
```

## Frontend
```bash
cd frontend
npm ci
cp .env.example .env  # if available
npm run dev
```

## Environment
- `MOCK_TELEBIRR=true` enables mock payments.
- `NODE_ENV=development` for local dev.
- `DATABASE_URL` / `TEST_DATABASE_URL` for Postgres.

## Notes
- Backend default port: 3001
- Frontend default port: 5173