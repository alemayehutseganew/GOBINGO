# GOBINGO Mock Gameplay Test Report

## Scope

This report covers end-to-end verification of a complete GOBINGO game using simulated funds in the local development environment. No real Telebirr credentials, production payment services, real money, or production data were used. Automated verification was performed with backend integration tests and a frontend production build. Manual browser gameplay was **not** claimed; UI play steps are provided for the user to perform.

## Environment

- Platform: Windows 11 / PowerShell
- Working directory: `C:\Users\alexo\Desktop\File\Code\GOBINGO`
- Backend: Node.js, Express, Socket.IO, PostgreSQL, optional Redis
- Frontend: Vite + React
- Payment mode: development mock provider (`NODE_ENV=development`, `PAYMENT_PROVIDER` unset/defaulting to `mock`)
- Redis: unavailable locally during tests; backend used the in-memory fallback

## Changes Made

1. Added `backend/tests/e2eMockGameplay.test.js` with 8 end-to-end scenarios covering mock deposits, idempotency, room joins, fees, claim validation, settlement, referral commission, and unauthorized/insufficient-balance cases.
2. Updated `backend/tests/helpers.js` to clear the `agents` table in `cleanDb()` for isolated test data.
3. Fixed environment restoration in mock-payment guard tests so `undefined` environment variables are deleted instead of being converted to the string `"undefined"`.
4. Raised route rate limits to `10000` only when `NODE_ENV=test` in `auth.js`, `wallet.js`, `telebirr.js`, and `rooms.js` to allow the full automated suite to run without false 429 responses.
5. No production data, migrations, or environment files were overwritten.

## Automated Test Results

### Backend

Command:

```powershell
cd C:\Users\alexo\Desktop\File\Code\GOBINGO\backend
npm test
```

Result: **PASS** — 9 test suites, 32 tests passed, exit code `0`.

New/updated coverage includes:

| Scenario | Result |
|---|---|
| Mock provider allowed in development | PASS |
| Mock provider rejected in production | PASS |
| Successful mock deposit credits exactly once | PASS |
| Duplicate mock confirmation is idempotent | PASS |
| Failed deposit does not credit wallet | PASS |
| Cancelled deposit does not credit wallet | PASS |
| Pending deposit does not credit wallet | PASS |
| Invalid deposit amount rejected | PASS |
| Invalid transaction reference rejected | PASS |
| Unauthorized confirmation by another user rejected | PASS |
| Unauthenticated wallet access rejected | PASS |
| Room join deducts entry fee and returns a 5x5 card | PASS |
| Insufficient balance prevents room join | PASS |
| Full game settles once | PASS |
| Winner is credited `50` from a `60` pool | PASS |
| Platform commission is `9` after `1` referral commission | PASS |
| Referral/agent commission is `1` | PASS |
| Room status becomes `FINISHED` | PASS |
| Duplicate settlement is rejected | PASS |
| Duplicate `WINNING_PAYOUT` ledger record is not created | PASS |
| Duplicate `AGENT_COMMISSION` ledger record is not created | PASS |

### Frontend

Command:

```powershell
cd C:\Users\alexo\Desktop\File\Code\GOBINGO\frontend
npm run build
```

Result: **PASS** — production build completed, exit code `0`.

### Docker Compose

Command:

```powershell
cd C:\Users\alexo\Desktop\File\Code\GOBINGO
docker compose config --quiet
```

Result: **PASS** — configuration valid, exit code `0`.

## Persistence After Restart

Automated tests verify that deposits, ledger rows, rooms, participants, and settlement records persist in PostgreSQL within the test process. A full process-restart persistence check was **not** automated because it would require stopping and restarting the application mid-test. Manual verification steps are listed below.

## Manual Verification Steps

1. Start PostgreSQL if it is not already running. The backend's `npm run dev` uses `scripts/ensurePostgres.js`, which expects PostgreSQL 18 at `C:\Program Files\PostgreSQL\18` unless `PG_CTL`, `PG_DATA`, `DB_HOST`, or `DB_PORT` are overridden.
2. From `backend`, run migrations if needed:

   ```powershell
   npm run migrate
   ```

3. Confirm `.env` remains development-only:
   - `NODE_ENV=development`
   - `PAYMENT_PROVIDER` unset or `mock`
   - `ALLOW_MOCK_PAYMENTS` not set to `true` in production
   - No real Telebirr credentials required for mock play
4. Start the backend and frontend using the commands in the final section.
5. Open `http://localhost:5173`.
6. The frontend automatically uses the development user (`999001`) unless `localStorage.devUser` is set.
7. To test multiple players, open separate browser profiles/incognito windows and run this in each browser console before refreshing:

   ```js
   localStorage.setItem('devUser', JSON.stringify({ id: 999002, first_name: 'Player2', username: 'player2' }));
   ```

   Use a different `id` for each player.
8. For each player, open Wallet, enter an amount, and click deposit. The app redirects to the mock checkout page.
9. On the mock checkout page, choose **Simulate Success**, **Simulate Failure**, **Simulate Cancelled**, or **Simulate Pending**.
10. Verify wallet balances after success and after non-success outcomes.
11. In the lobby, join a level. Each join deducts the level entry fee and creates/returns a 5x5 card.
12. Join with at least two and preferably six players, then click **Start Game**.
13. Click **Claim Bingo** only when the card has a valid completed row/column/diagonal based on drawn numbers.
14. Verify the winner modal shows payout, platform fee, agent commission, and total pool.
15. Repeat a claim or settlement request and confirm the game remains finished and balances are not credited twice.
16. Persistence check: stop the backend, query PostgreSQL for users, deposits, rooms, participants, and ledger rows, then restart the backend and confirm balances remain unchanged.

## Bugs Found and Fixes Made

1. **Environment-variable restoration bug in mock guard tests**  
   Assigning `undefined` to `process.env` converted it to the string `"undefined"`, which made `PAYMENT_PROVIDER` truthy and disabled mock mode in later tests. Fixed by deleting undefined environment variables during restoration.

2. **Test isolation gap in `cleanDb()`**  
   The `agents` table was not cleared, which could leak referral-agent state between tests. Fixed by adding `agents` deletion before `users`.

3. **Rate-limit interference during full automated runs**  
   Route limiters could return `429` when all suites ran together. Fixed by raising limits to `10000` only when `NODE_ENV=test`; production/development limits remain unchanged.

## Remaining Blockers

1. **Telebirr webhook signature algorithm is still unverified** against official documentation. Production Telebirr callbacks remain rejected by design until the canonical signature format is confirmed.
2. **Automated external payout disbursement is not implemented.** Settlement credits the winner internally and records the platform/agent amounts, but no real payout provider is called.
3. **Production secrets are still stored in local `.env`.** They should be moved to a secret manager before production deployment.
4. **Redis is unavailable in the current local environment.** Development uses the in-memory fallback; production should use Redis for Socket.IO scaling.

## Exact PowerShell Commands to Start GOBINGO Locally

Backend:

```powershell
cd C:\Users\alexo\Desktop\File\Code\GOBINGO\backend
npm run dev
```

Frontend, in a second terminal:

```powershell
cd C:\Users\alexo\Desktop\File\Code\GOBINGO\frontend
npm run dev
```

Then open:

```text
http://localhost:5173
```

The backend listens on `http://localhost:3001`. In development, mock payments are enabled by default and no real Telebirr credentials are needed.
