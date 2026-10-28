# Phase 3 Financial Integrity

## Preserved financial behavior

- Demo and real rooms remain isolated through `is_demo`.
- Demo balances use `demo_wallet_balance`.
- Real balances use `wallet_balance`.
- Demo ledger entries use `is_demo = true`.
- Telebirr is not invoked during gameplay or payout.
- Entry fees are charged once per room join and recorded in `financial_ledger`.
- Existing payout formulas were not changed.

## Current payout behavior

- `processRoomPayout` uses a transaction.
- It locks the room row.
- It requires the room to be `RUNNING` or `RESOLVING`.
- It blocks settlement if the room is already `FINISHED` or has `settled_at`.
- It credits the winner, platform, and referral commission.
- It updates room status to `FINISHED`.

## Known financial risks

1. Shared-winner payout is not implemented.
2. The current behavior pays the first accepted valid claim.
3. Claim window duration is not defined.
4. Whether one player with multiple winning cards receives multiple shares is not defined.
5. Remainder allocation for indivisible currency is not defined.
6. Whether multiple patterns on one card generate multiple prizes is not defined.
7. Card selection does not charge an additional entry fee. The existing join charges one entry fee.
8. Settlement idempotency relies on room status and winner fields; a unique settlement reference constraint is not yet enforced.
9. Payout failure rolls back the transaction, but in-memory game state may require recovery.

## Owner decisions required

- Shared-winner allocation policy.
- Claim window duration.
- Remainder handling.
- Whether multiple cards can generate multiple prize shares.
- Billing policy for additional cards.
