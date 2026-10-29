# GOBINGO — System Patterns

## Architecture
- **Backend**: Node.js 22, Express REST API + Socket.IO real-time layer.
- **Frontend**: React (Vite) Telegram Mini App.
- **Database**: PostgreSQL via Knex (migrations in `backend/src/db/migrations`).
- **Cache/Adapter**: Redis for Socket.IO adapter and shared state.
- **Payments**: Telebirr (production) / mock payment service (dev/demo).

## Key Modules
- `backend/src/socket/gameHandler.js`: authoritative game loop, draw loop, claims, refunds.
- `backend/src/routes/rooms.js`: room join, card selection board, registration lifecycle.
- `backend/src/utils/bingoCard.js`: 5x5 card generation and validation.
- `backend/src/utils/claimValidator.js`: pattern definitions, completion checks, claim validation.
- `backend/src/utils/drawEngine.js`: 75-number draw pool creation/validation.
- `backend/src/services/payoutService.js`: room settlement and payout.
- `backend/src/services/refundService.js`: refund flow for no-winner rounds.

## Core Patterns
- **Authoritative server state**: called numbers and marked cells are derived server-side.
- **Database locking**: `SELECT ... FOR UPDATE` protects room/participant/payout races.
- **Idempotent settlement**: conditional status transitions prevent double payout.
- **Card uniqueness**: `room_card_selections` enforces unique `room_id + card_id`.
- **Pattern allow-lists**: rooms store `winning_patterns`; claims validate against selected patterns.

## Ethio Bingo Pivot Patterns
- **Card pool**: selectable card IDs are `1..400` (currently implemented as `1..600`; align).
- **Max cards per player**: `MAX_CARDS_PER_PLAYER = 2`.
- **Allowed patterns**: horizontal rows, vertical columns, both diagonals, four corners.
  Remove full-house/blackout from default allowed patterns and validation.
- **Multiple winners**: claim/settlement flow must collect all eligible winners for the
  round and split `winnerPrizeCents` across them instead of crediting one user.

## Data Flow (Round)
1. Room created with registration window.
2. Players join and reserve up to 2 cards.
3. Registration closes; `startRoomGame` loads participants/cards and starts draw loop.
4. Draw loop consumes next number from `draw_pool`, broadcasts `number_drawn`.
5. Player emits `claim_bingo`; server validates card, drawn numbers, selected patterns,
   and closing number.
6. On valid claim, room moves to resolving/finished and payout runs.
7. If no claim by draw completion + grace, refund runs.

## Open Design Notes
- Draw pool size for Ethio Bingo is not specified in the pivot request; keep 75 unless
  requirements change.
- Prize split rounding rule (floor/round/remainder) must be defined before implementation.
