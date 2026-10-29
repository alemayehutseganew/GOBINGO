# GOBINGO — Product Context

## Why This Project Exists
GOBINGO brings a familiar bingo experience into Telegram as a Mini App, removing the need
for separate downloads while keeping real-money (and demo) gameplay, wallet balances, and
agent commissions.

## Target Users
- Telegram users who want quick multiplayer bingo sessions.
- Demo users testing gameplay without real funds.
- Agents/referrers who earn commission from referred winners.

## Core User Flows
1. Authenticate via Telegram init data (or dev user in non-production).
2. View wallet balance and deposit funds (Telebirr in production, mock in dev/demo).
3. Join a room by level (entry fee tier).
4. Select up to 2 cards from the card pool during registration.
5. Play live rounds: numbers are drawn automatically at an interval.
6. Claim bingo on a completed Ethio Bingo pattern.
7. Receive winnings (split if multiple winners) or refund if no winner.

## Ethio Bingo Pivot Impact
- Card selection UX must reflect the 1-400 card pool.
- Pattern selection/claim UI must only offer horizontal, vertical, diagonal, and
  four-corners patterns.
- Winner announcement and payout messaging must reflect multiple winners sharing prize.
- Refund behavior stays the same when no eligible claim occurs.

## Experience Goals
- Fast join/select/start flow.
- Clear card ownership and availability states.
- Authoritative server-side validation; client never trusts marked cards.
- Transparent payout and refund outcomes.
