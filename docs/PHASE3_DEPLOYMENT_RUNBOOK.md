# Phase 3 Deployment Runbook

## Local verification
- `npm test` in `backend`
- `npm run build` in `frontend`
- `docker compose config --quiet`
- `docker compose build`

## Production notes
- Run migrations as a controlled deployment step, not from every replica.
- Set `NODE_ENV=production`, `TELEBIRR_ENV` appropriately, and production secrets.
- Keep database and Redis ports internal in production.
- Enable TLS at reverse proxy.