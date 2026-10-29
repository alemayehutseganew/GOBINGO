# GOBINGO — Active Context

## Current Focus
Initializing the memory bank and capturing the pivot from the current 75-ball
implementation to **Ethio Bingo** rules.

## Recent State
- Backend and frontend implement room-based multiplayer bingo with card selection,
  live draws, claims, payouts, and refunds.
- Card pool is currently 600 (`1..600`) and max 2 cards per player.
- Winning patterns currently include full house/blackout in addition to
  row/column/diagonal/four corners.
- Payout currently credits a single winner.

## Next Steps (Ethio Bingo)
1. Align card pool constants and validation to `1..400`.
2. Restrict default/allowed winning patterns to horizontal, vertical, diagonals,
   and four corners.
3. Update claim validation and UI pattern lists accordingly.
4. Modify settlement to split winner prize among multiple eligible winners.
5. Update tests for card pool, patterns, and split payout.
6. Update frontend card board grid and pattern picker labels.

## Open Questions
- Exact Ethio Bingo ball draw pool size (keep 75 unless specified).
- Rounding/remainder policy for splitting prize among multiple winners.
- Whether ties require simultaneous claim handling changes.
- Whether card 1-400 pool should be deterministic or generated per room.

## Notes
- No code changes have been made for the pivot yet; this memory bank records the
  intended target and current baseline.
