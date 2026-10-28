# Phase 3 Local Deployment Steps

## Administrator commands

Start PostgreSQL:

```powershell
Start-Service postgresql-x64-18
& 'C:\Program Files\PostgreSQL\18\bin\pg_isready.exe' -h 127.0.0.1 -p 5432
```

Inspect databases without modifying them:

```powershell
$env:PGPASSWORD = '<local PostgreSQL password>'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atc "SELECT datname FROM pg_database ORDER BY datname;"
```

Create `gobingo_test` only if it does not already exist:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -h 127.0.0.1 -p 5432 -U postgres gobingo_test
```

## Application verification

```powershell
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgresql://<local-user>:<local-password>@127.0.0.1:5432/gobingo_test'
node backend/tests/testDbSafety.js
npm run migrate
npm test
cd frontend
npm run build
cd ..
git diff --check
```
## CI readiness

The CI backend job (`backend` job in `.github/workflows/ci.yml`) is configured to:
1. Start PostgreSQL 16 service (`gobingo_test` database)
2. Run `npm ci`
3. Run `node ./tests/testDbSafety.js && npm run migrate`
4. Run `node ./tests/verifyTestSchema.js`
5. Run `npm test`

CI is **configured but unproven** — no CI run has been executed because PostgreSQL is unavailable locally. The frontend job uses Node 20 while the project requires Node 22.x.

## Safety notes

- Never use `gobingo` for automated tests.
- Never reset or overwrite an existing database.
- Never expose credentials or `.env` contents.
- Do not commit, push, deploy, or enable production payments.
- Preserve `backend/node_modules.backup-phase-g/`.
