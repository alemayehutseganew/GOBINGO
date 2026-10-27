# Deployment Checklist

## Render (backend)
- Build Command: `npm ci && npm run migrate`
- Start Command: `npm start`
- Health Check Path: `/health`
- Root Directory: `backend`
- NODE_ENV=production

Render environment variable names (keys only; set values in dashboard):
- DATABASE_URL
- JWT_SECRET (32+ characters)
- TELEGRAM_BOT_TOKEN
- MINI_APP_URL
- CORS_ORIGINS
- PAYMENT_PROVIDER
- ALLOW_MOCK_PAYMENTS
- REDIS_URL (optional)
- TELEGRAM_BOT_USERNAME
- TELEGRAM_WEBHOOK_URL
- TELEGRAM_WEBHOOK_SECRET
- TELEBIRR_ENV
- TELEBIRR_APP_ID
- TELEBIRR_APP_KEY
- TELEBIRR_PUBLIC_KEY
- TELEBIRR_SHORT_CODE
- TELEBIRR_NOTIFY_URL
- TELEBIRR_WEBHOOK_SECRET
- TELEBIRR_BASE_URL
- DB_SSL
- DB_SSL_REJECT_UNAUTHORIZED
- PLATFORM_COMMISSION_RATE
- AGENT_COMMISSION_RATE
- GAME_EXPECTED_PLAYERS
- FRONTEND_URL
- BACKEND_URL

## Vercel (frontend)
- VITE_API_URL (requires frontend redeploy after change)
- VITE_BACKEND_URL

## Post-deploy log checklist
- knex migration lines in the build
- `Listening on <port>`
- `[TELEGRAM] Bot launched`
- no `relation "users" does not exist`
- no `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`

## Token rotation
- Revoke via BotFather `/revoke`
- Update Render `TELEGRAM_BOT_TOKEN`
- Redeploy
