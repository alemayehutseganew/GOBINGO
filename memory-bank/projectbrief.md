# GOBINGO — Project Brief

## Overview
GOBINGO is a real-time multiplayer bingo game delivered as a Telegram Mini App.
Players join rooms, select cards, and play live draw rounds with wallet-based entry fees
and automated payouts.

## Product Goal
Provide a low-latency, fair, and auditable multiplayer bingo experience with
Telegram-native authentication, demo mode, and Telebirr-backed payments.

## Current Baseline (before pivot)
- 75-ball bingo.
- Card matrix: 5x5 with a FREE center (B/I/N/G/O columns, 1-75).
- Draw pool: 75 unique numbers (1-75).
- Winning patterns: rows, columns, both diagonals, four corners, full house/blackout.
- Card selection pool: 600 generated cards.
- Max cards per player: 2.
- Settlement: single winner receives the winner prize.

## Pivot Target: Ethio Bingo
The game logic is being pivoted to match **Ethio Bingo** with these key rules:

1. **Max 2 cards per player** (already enforced in card selection; keep and verify).
2. **Card pool 1-400** (reduce/align selectable card IDs from current 600 to 400).
3. **Winning patterns are horizontal, vertical, diagonals, and four corners only**
   - Allowed: `ROW_*`, `COL_*`, `DIAG_MAIN`, `DIAG_ANTI`, `FOUR_CORNERS`.
   - Disallowed for Ethio Bingo: `FULL_HOUSE` / `BLACKOUT`.
4. **Prize is split among multiple winners** (settlement must support multiple winners
   sharing the winner prize instead of a single winner).

## Success Criteria
- Card selection only exposes cards 1-400.
- No more than 2 cards can be reserved per player per room.
- Only Ethio Bingo winning patterns can be selected/claimed.
- Settlement splits the winner prize across all eligible winners in a round.
- Existing financial integrity, refund, and audit behaviors remain intact.
- Tests cover the new card pool, pattern restrictions, and split payout.
