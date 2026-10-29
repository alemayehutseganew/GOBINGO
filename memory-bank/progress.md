# GOBINGO — Progress

## Done
- Real-time multiplayer room flow (join, register, select cards, draw, claim).
- Telegram auth, wallet, deposits, demo mode.
- Card selection with max 2 cards per player and unique card IDs.
- Card selection pool updated to 400 cards; selected cards marked as 'taken' for others.
- Room creation now generates and stores a 400-card pool.
- Authoritative claim validation and refund flow.
- Financial ledger and payout/refund services.
- Memory bank initialized with Ethio Bingo pivot context.

## In Progress
- Pivot documentation and planning for Ethio Bingo rules.

## To Do (Ethio Bingo)
- [ ] Change card pool from 1-600 to 1-400 (backend + frontend).
- [ ] Remove FULL_HOUSE/BLACKOUT from default allowed patterns.
- [ ] Update claim validator tests and pattern picker.
- [ ] Implement split payout for multiple winners.
- [ ] Update payout tests and reports.
- [ ] Verify card generation/validation compatibility.

## Known Gaps vs Ethio Bingo Target
- Card pool currently 600, target 400.
- Pattern set currently broader than Ethio Bingo target.
- Settlement currently single-winner, target split among winners.

## Validation
- Backend test suite exists under `backend/tests`.
- Node 22.x required; dependency-dependent checks skipped if version differs.
