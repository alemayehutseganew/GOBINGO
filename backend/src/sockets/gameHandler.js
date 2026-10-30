const { Server } = require('socket.io');
const db = require('../db/knex');
const { validateTelegramInitData } = require('../middleware/telegramAuth');
const {
  evaluatePatterns,
  closingNumberInPattern,
  DEFAULT_ALLOWED_PATTERNS,
  isPatternSupported,
  normalizePattern,
  validateCard,
  normalizeAllowedPatterns,
  validateClaim,
  validateBingo,
} = require('../game/ethioValidator');
const { isDemoMode } = require('../config/env');
const { calculatePayout } = require('../game/jackpotSplitter');
const { processRoomRefund } = require('../services/refundService');
const { REFUND_GRACE_MS } = require('../config/gameLimits');
const MIN_PLAYERS = 2;
const { createDrawPool, validateDrawPool } = require('../utils/drawEngine');
const { generateCardPool } = require('../game/cardGenerator');

const activeGames = new Map();
const rooms = {};
const DRAW_INTERVAL_MS = Number(process.env.DRAW_INTERVAL_MS || 3000);
const DEFAULT_GAME_PATTERNS = DEFAULT_ALLOWED_PATTERNS.filter((pattern) => pattern !== 'BLACKOUT');

function parseUser(socket) {
  const initData = socket.handshake.auth?.initData || socket.handshake.query?.initData;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && (!botToken || botToken === 'your-telegram-bot-token')) {
    if (socket.handshake.auth?.devUser) {
      try {
        const parsed = JSON.parse(socket.handshake.auth.devUser);
        if (parsed && parsed.id !== undefined && parsed.id !== null) {
          return parsed;
        }
      } catch (e) {}
    }
    if (initData) {
      const params = new URLSearchParams(initData);
      const u = params.get('user');
      if (u) {
        try {
          const parsed = JSON.parse(u);
          if (parsed && parsed.id !== undefined && parsed.id !== null) {
            return parsed;
          }
        } catch (e) {}
      }
    }
    return null;
  }
  if (botToken && botToken !== 'your-telegram-bot-token' && initData) {
    const result = validateTelegramInitData(initData, botToken);
    if (result && result.ok && result.user && result.user.id !== undefined && result.user.id !== null) {
      return result.user;
    }
  }
  return null;
}

async function getUserByTelegramId(tgId) {
  if (tgId === undefined || tgId === null || tgId === '') {
    throw new Error('Missing Telegram ID');
  }
  return db('users').where({ telegram_id: tgId }).first();
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  const allowed = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return origin === 'https://gobingo-rho.vercel.app';
  return allowed.includes(origin);
}

function getAllowedPatterns(room) {
  if (Array.isArray(room?.winning_patterns)) {
    const normalized = [];
    const seen = new Set();
    for (const pattern of room.winning_patterns) {
      const canonical = normalizePattern(pattern);
      if (canonical && isPatternSupported(canonical) && !seen.has(canonical)) {
        seen.add(canonical);
        normalized.push(canonical);
      }
    }
    if (normalized.length > 0) return normalized;
  }
  const configured = process.env.GAME_WINNING_PATTERNS;
  if (configured) {
    const normalized = [];
    const seen = new Set();
    for (const pattern of configured.split(',')) {
      const canonical = normalizePattern(pattern.trim());
      if (canonical && isPatternSupported(canonical) && !seen.has(canonical)) {
        seen.add(canonical);
        normalized.push(canonical);
      }
    }
    if (normalized.length > 0) return normalized;
  }
  return [...DEFAULT_GAME_PATTERNS];
}

function getSelectedPatterns(participant) {
  if (!participant) return [];
  return normalizeAllowedPatterns(participant.selected_patterns);
}

function validatePatternSelection(patterns, availablePatterns) {
  const available = normalizeAllowedPatterns(availablePatterns);
  if (!Array.isArray(patterns)) {
    return { valid: false, error: 'Selection must be an array', patterns: [] };
  }
  if (patterns.length === 0) {
    return { valid: false, error: 'At least one pattern must be selected', patterns: [] };
  }
  const maxSelectable = Number(process.env.MAX_SELECTABLE_PATTERNS || 0);
  if (maxSelectable > 0 && patterns.length > maxSelectable) {
    return { valid: false, error: `Maximum ${maxSelectable} patterns allowed`, patterns: [] };
  }
  const normalized = [];
  const seen = new Set();
  for (const pattern of patterns) {
    const canonical = normalizePattern(pattern);
    if (!canonical || !isPatternSupported(canonical)) {
      return { valid: false, error: `Unknown pattern: ${pattern}`, patterns: [] };
    }
    if (!available.includes(canonical)) {
      return { valid: false, error: `Pattern not available: ${canonical}`, patterns: [] };
    }
    if (!seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    }
  }
  if (normalized.length === 0) {
    return { valid: false, error: 'At least one pattern must be selected', patterns: [] };
  }
  return { valid: true, error: null, patterns: normalized };
}
async function consumeNextDraw(roomId) {
  return db.transaction(async (trx) => {
    const room = await trx('game_rooms').where({ id: roomId }).forUpdate().first();
    if (!room || room.status !== 'RUNNING') return null;
    const pool = room.draw_pool;
    if (!Array.isArray(pool) || pool.length !== 75) throw new Error('Invalid draw pool');
    const drawIndex = Number.isInteger(room.draw_index) ? room.draw_index : 0;
    if (drawIndex >= pool.length) {
      return { complete: true };
    }
    const number = pool[drawIndex];
    const nextIndex = drawIndex + 1;
    const drawn = Array.isArray(room.drawn_numbers) ? room.drawn_numbers.slice() : [];
    drawn.push(number);
    await trx('game_rooms').where({ id: roomId }).update({
      draw_index: nextIndex,
      latest_number: number,
      drawn_numbers: JSON.stringify(drawn),
      last_drawn_at: new Date(),
    });
    return { number, drawIndex: nextIndex, drawn, timestamp: new Date().toISOString() };
  });
}

function scheduleRefund(io, game, roomId) {
  if (game.refundTimer) return;

  let attempts = 0;
  const runRefund = async () => {
    if (!activeGames.has(roomId)) {
      if (game.refundTimer) {
        clearTimeout(game.refundTimer);
        game.refundTimer = null;
      }
      return;
    }

    game.refundTimer = null;
    try {
      const refundInfo = await processRoomRefund(db, roomId);
      game.stopped = true;
      if (game.refundTimer) {
        clearTimeout(game.refundTimer);
        game.refundTimer = null;
      }
      activeGames.delete(roomId);
      if (io) {
        io.to(roomId).emit('game_refunded', {
          roomId,
          refundedPlayers: refundInfo.refundedPlayers,
          refundedAmount: refundInfo.refundedAmount,
          entryFeeRefunded: refundInfo.entryFeeRefunded,
        });
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const expected = /already settled|already has a winner|already refunded|not running/i.test(message);

      if (expected) {
        console.info('[refund] skipped for room', roomId, ':', message);
        if (game.refundTimer) {
          clearTimeout(game.refundTimer);
          game.refundTimer = null;
        }
        activeGames.delete(roomId);
        return;
      }

      attempts += 1;
      game.refundTimer = null;
      if (attempts <= 3) {
        console.warn('[refund] attempt', attempts, 'failed for room', roomId, ':', message);
        game.refundTimer = setTimeout(runRefund, 10000);
      } else {
        console.error('[refund] failed for room', roomId, ':', message);
      }
    }
  };

  game.refundTimer = setTimeout(runRefund, REFUND_GRACE_MS);
}

function startDrawLoop(io, game, roomId) {
  if (game.interval) return;
  game.interval = setInterval(async () => {
    if (game.stopped) {
      clearInterval(game.interval);
      game.interval = null;
      return;
    }
    if (game.drawInProgress) return;
    game.drawInProgress = true;
    try {
      const result = await consumeNextDraw(roomId);
      if (!result) {
        game.stopped = true;
        clearInterval(game.interval);
        game.interval = null;
        activeGames.delete(roomId);
        return;
      }
      if (result.complete) {
        game.drawComplete = true;
        if (game.interval) {
          clearInterval(game.interval);
          game.interval = null;
        }
        io.to(roomId).emit('game_completed', { roomId });
        scheduleRefund(io, game, roomId);
        return;
      }
      game.drawIndex = result.drawIndex;
      game.latestNumber = result.number;
      game.drawn = result.drawn;
      io.to(roomId).emit('number_drawn', {
        roomId,
        number: result.number,
        drawIndex: result.drawIndex,
        drawn: result.drawn,
        timestamp: result.timestamp,
      });
    } catch (err) {
      console.error(err);
      io.to(roomId).emit('error', { message: 'Draw failed' });
    } finally {
      game.drawInProgress = false;
    }
  }, DRAW_INTERVAL_MS);
}

async function recoverActiveGame(io, roomId) {
  if (activeGames.has(roomId)) return activeGames.get(roomId);
  const room = await db('game_rooms').where({ id: roomId }).first();
  if (!room || room.status !== 'RUNNING' || !Array.isArray(room.draw_pool)) return null;
  const drawn = Array.isArray(room.drawn_numbers) ? room.drawn_numbers.slice() : [];
  const game = {
    interval: null,
    drawn,
    stopped: false,
    drawComplete: false,
    drawPool: room.draw_pool,
    drawIndex: Number.isInteger(room.draw_index) ? room.draw_index : drawn.length,
    latestNumber: room.latest_number,
    drawInProgress: false,
    refundTimer: null,
    roomId,
  };
  activeGames.set(roomId, game);
  if (game.drawIndex < game.drawPool.length) {
    startDrawLoop(io, game, roomId);
  } else {
    game.drawComplete = true;
    scheduleRefund(io, game, roomId);
  }
  return game;
}

async function startRoomGame(io, roomId) {
  const existingGame = activeGames.get(roomId);
  if (existingGame && !existingGame.stopped) return { ok: false, error: 'Game already started' };
  let result;
  try {
    result = await db.transaction(async (trx) => {
      const room = await trx('game_rooms').where({ id: roomId }).forUpdate().first();
      if (!room) throw new Error('Room not found');
      if (room.status !== 'WAITING') throw new Error('Room not available');
      if (room.registration_ends_at && new Date(room.registration_ends_at).getTime() > Date.now()) throw new Error('Registration is still open');
      const participants = await trx('room_participants').where({ room_id: roomId });
      if (participants.length < MIN_PLAYERS) throw new Error('At least 2 players are required');
      const availablePatterns = getAllowedPatterns(room);
      for (const p of participants) {
        const sel = getSelectedPatterns(p);
        if (sel.length === 0) throw new Error('All players must select patterns before starting');
        const validation = validatePatternSelection(sel, availablePatterns);
        if (!validation.valid) throw new Error('All players must select patterns before starting');
      }
      const pool = createDrawPool();
      const winningPatterns = getAllowedPatterns(room);
      const [updated] = await trx('game_rooms').where({ id: roomId, status: 'WAITING' }).update({
        status: 'RUNNING',
        started_at: new Date(),
        drawn_numbers: JSON.stringify([]),
        draw_pool: JSON.stringify(pool),
        draw_index: 0,
        latest_number: null,
        last_drawn_at: null,
        winning_patterns: JSON.stringify(winningPatterns),
        winner_id: null,
        winning_pattern: null,
        claim_user_id: null,
        claim_closing_number: null,
        claimed_at: null,
        settled_at: null,
        settlement_reference: null,
        total_pool: null,
      }).returning('*');
      if (!updated) throw new Error('Room not available');
      return { room: updated, participants, pool, winningPatterns };
    });
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Start failed' };
  }
  const game = {
    interval: null,
    drawn: [],
    stopped: false,
    drawPool: result.pool,
    drawIndex: 0,
    latestNumber: null,
    drawInProgress: false,
    roomId,
  };
  activeGames.set(roomId, game);
  if (io) io.to(roomId).emit('game_started', { roomId, winningPatterns: result.winningPatterns });
  startDrawLoop(io, game, roomId);
  return { ok: true, ...result };
}

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const tgUser = parseUser(socket);
    if (!tgUser || tgUser.id === undefined || tgUser.id === null || tgUser.id === '') {
      return next(new Error('Unauthorized'));
    }
    socket.tgUser = tgUser;
    next();
  });

  io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('join_room', async ({ roomId, userId, stake }) => {
      try {
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) { socket.emit('error', { message: 'User not found' }); return; }
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
        if (!participant) { socket.emit('error', { message: 'Not a participant' }); return; }
        const room = await db('game_rooms').where({ id: roomId }).first();
        currentRoom = roomId;
        socket.join(roomId);
        if (!rooms[roomId]) {
          rooms[roomId] = {
            id: roomId,
            stake: Number(stake || room.entry_fee) || 10,
            status: room.status || 'WAITING',
            players: {},
            cardPool: generateCardPool(400),
            calledNumbers: new Set(),
            prizePool: 0,
            countdown: 40,
          };
        } else if (stake) {
          rooms[roomId].stake = Number(stake);
        }

        // Always use the internal database user.id for in-memory rooms to match the DB
        const playerId = user.id; 
        rooms[roomId].players[playerId] = rooms[roomId].players[playerId] || { socketId: socket.id, cards: [] };
        rooms[roomId].players[playerId].socketId = socket.id;

        const selections = await db('room_card_selections').where({ room_id: roomId, user_id: playerId });
        rooms[roomId].players[playerId].cards = selections.map((sel) => ({
          id: sel.card_id,
          matrix: typeof sel.card === 'string' ? JSON.parse(sel.card) : sel.card,
        }));

        const playerCount = Object.keys(rooms[roomId].players).length;
        console.log(`Player ${playerId} joined ${roomId}. Total players: ${playerCount}`);
        io.to(roomId).emit('room_update', {
          players: playerCount,
          stake: rooms[roomId].stake,
        });

        if (playerCount >= 2 && rooms[roomId].status === 'WAITING') {
          startCountdown(io, roomId, rooms);
        }

        if (room.status === 'RUNNING') {
          await recoverActiveGame(io, roomId);
        }
        io.to(roomId).emit('room_update', {
          players: Object.keys(rooms[roomId].players).length,
          stake: rooms[roomId].stake,
        });
        const participants = await db('room_participants').where({ room_id: roomId });
        socket.emit('room_state', {
          room,
          card: participant.card,
          drawn: room.drawn_numbers || [],
          drawIndex: room.draw_index || 0,
          latestNumber: room.latest_number,
          winningPatterns: room.winning_patterns || null,
          availablePatterns: getAllowedPatterns(room),
          selectedPatterns: getSelectedPatterns(participant),
          participants: participants.map((p) => ({ user_id: p.user_id, selectedPatterns: getSelectedPatterns(p) })),
        });
        io.to(roomId).emit('player_joined', { userId: user.id, count: participants.length });
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: 'Join room failed' });
      }
    });

    socket.on('select_patterns', async ({ roomId, patterns }) => {
      try {
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) { socket.emit('pattern_selection_result', { ok: false, error: 'User not found' }); return; }
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
        if (!participant) { socket.emit('pattern_selection_result', { ok: false, error: 'Not a participant' }); return; }
        const room = await db('game_rooms').where({ id: roomId }).first();
        if (room.status !== 'WAITING') { socket.emit('pattern_selection_result', { ok: false, error: 'Selections are locked' }); return; }

        const availablePatterns = getAllowedPatterns(room);
        const validation = validatePatternSelection(patterns, availablePatterns);
        if (!validation.valid) {
          socket.emit('pattern_selection_result', { ok: false, error: validation.error });
          return;
        }

        await db('room_participants').where({ id: participant.id }).update({
          selected_patterns: JSON.stringify(validation.patterns),
        });

        socket.emit('pattern_selection_result', { ok: true, patterns: validation.patterns });

        const updatedParticipants = await db('room_participants').where({ room_id: roomId });
        const readyCount = updatedParticipants.filter((p) => {
          const sel = getSelectedPatterns(p);
          return sel.length > 0;
        }).length;

        io.to(roomId).emit('player_patterns_updated', {
          userId: user.id,
          patterns: validation.patterns,
        });
        io.to(roomId).emit('pattern_selection_status', {
          ready: readyCount,
          total: updatedParticipants.length,
        });
      } catch (err) {
        console.error(err);
        socket.emit('pattern_selection_result', { ok: false, error: err && err.message ? err.message : 'Selection failed' });
      }
    });

    socket.on('start_game', async ({ roomId }) => {
      try {
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) { socket.emit('error', { message: 'User not found' }); return; }
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
        if (!participant) { socket.emit('error', { message: 'Not a participant' }); return; }
        const existingGame = activeGames.get(roomId);
        if (existingGame && !existingGame.stopped) {
          socket.emit('error', { message: 'Game already started' });
          return;
        }
        const result = await startRoomGame(io, roomId);
        if (!result.ok) { socket.emit('error', { message: result.error || 'Start failed' }); return; }
        const game = {
          interval: null,
          drawn: [],
          stopped: false,
          drawComplete: false,
          drawPool: result.pool,
          drawIndex: 0,
          latestNumber: null,
          drawInProgress: false,
          refundTimer: null,
          roomId,
        };
        activeGames.set(roomId, game);
        io.to(roomId).emit('game_started', { roomId, winningPatterns: result.winningPatterns });
        startDrawLoop(io, game, roomId);
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: err && err.message ? err.message : 'Start failed' });
      }
    });

    socket.on('claim_bingo', ({ roomId, userId, cardId, markedNumbers }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.status === 'ENDED') return;

      // Find player by Telegram ID or DB ID depending on how the frontend sent it
      const player = room.players && (room.players[userId] || Object.values(room.players).find(p => p.userId === userId));
      const card = player && Array.isArray(player.cards) ? player.cards.find((c) => c.id === cardId) : null;
      
      if (!card) {
        socket.emit('claim_failed', { roomId, userId, reason: 'Card not found' });
        return;
      }

      const calledSet = new Set(markedNumbers || []);
      const result = validateBingo(card.matrix || card, calledSet);
      if (!result.isValid) {
        socket.emit('claim_failed', { roomId, userId, reason: 'Invalid bingo' });
        return;
      }

      if (room.status !== 'CLAIMING') {
        room.status = 'CLAIMING';
        room.validWinners = [];
        if (room.intervalId) { clearInterval(room.intervalId); room.intervalId = null; }
        setTimeout(() => {
          room.status = 'ENDED';
          const winnerCount = room.validWinners.length || 1;
          const payout = calculatePayout(room.prizePool || 0, 10, winnerCount);
          const winnerDetails = room.validWinners.map((w) => ({
            userId: w.userId,
            cardId: w.cardId,
            card: w.card,
            payout: payout.payoutPerWinner,
          }));
          io.to(roomId).emit('game_over', {
            winners: winnerDetails,
            payout: payout.payoutPerWinner,
            winningCards: winnerDetails.map((w) => w.card),
          });
          setTimeout(() => {
            room.status = 'WAITING';
            room.calledNumbers = new Set();
            room.validWinners = [];
            room.prizePool = 0;
          }, 10000);
        }, 3000);
      }

      if (!room.validWinners) room.validWinners = [];
      if (!room.validWinners.some((w) => w.userId === userId && w.cardId === cardId)) {
        room.validWinners.push({ userId, cardId, card });
      }
      io.to(roomId).emit('player_claimed', { roomId, userId, cardId });
    });

    // FIXED: Always fetch from DB to guarantee data is not empty
    socket.on('get_my_cards', async ({ roomId, userId }) => {
      try {
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) return;
        
        const selections = await db('room_card_selections').where({ room_id: roomId, user_id: user.id });
        const cards = selections.map((sel) => ({
          id: sel.card_id,
          matrix: typeof sel.card === 'string' ? JSON.parse(sel.card) : sel.card,
        }));
        
        socket.emit('my_cards', { roomId, userId, cards });
      } catch (err) {
        console.error(err);
        socket.emit('my_cards', { roomId, userId, cards: [] });
      }
    });


    socket.on('leave_room', () => { if (currentRoom) socket.leave(currentRoom); currentRoom = null; });
    socket.on('disconnect', () => {
      if (currentRoom) socket.leave(currentRoom);

      for (const roomId of Object.keys(rooms)) {
        const room = rooms[roomId];
        if (!room || !room.players) continue;
        for (const userId of Object.keys(room.players)) {
          if (room.players[userId].socketId === socket.id) {
            delete room.players[userId];
            io.to(roomId).emit('player_left', { roomId, userId });

            if (room.status === 'PLAYING' && Object.keys(room.players).length < 2) {
              if (room.intervalId) {
                clearInterval(room.intervalId);
                room.intervalId = null;
              }
              room.status = 'ENDED';
              io.to(roomId).emit('game_over', { winner: null, reason: 'Not enough players' });
            }
          }
        }
      }
    });
  });
  return io;
}

async function recoverRunningGames(io) {
  const rooms = await db('game_rooms').where({ status: 'RUNNING' });
  for (const room of rooms) {
    await recoverActiveGame(io, room.id);
  }
}

async function settleClaimingWindow(io, game, roomId) {
  if (!game || !game.claiming || game.claiming.settling) return;
  game.claiming.settling = true;
  if (game.claiming.timer) { clearTimeout(game.claiming.timer); game.claiming.timer = null; }
  const winners = game.claiming.winners.slice();
  try {
    const winnerCount = winners.length > 0 ? winners.length : 1;
    const room = await db('game_rooms').where({ id: roomId }).first();
    const participants = await db('room_participants').where({ room_id: roomId });
    const entryFeeCents = Math.round(Number(room.entry_fee) * 100);
    const totalPoolCents = participants.length * entryFeeCents;
    const payout = calculatePayout(totalPoolCents, 100 / 6, winnerCount);
    const payoutPerWinner = payout.payoutPerWinner;
    const isDemo = Boolean(room.is_demo);
    const balanceField = isDemo ? 'demo_wallet_balance' : 'wallet_balance';
    for (const winner of winners) {
      await db('users').where({ id: winner.userId }).increment(balanceField, payoutPerWinner);
      await db('room_participants').where({ id: winner.participantId }).update({ is_winner: true });
      await db('financial_ledger').insert({
        user_id: winner.userId,
        amount: payoutPerWinner,
        type: isDemo ? 'DEMO_WINNING_PAYOUT' : 'WINNING_PAYOUT',
        reference_id: `ROOM_${roomId}`,
        is_demo: isDemo,
      });
    }
    await db('game_rooms').where({ id: roomId }).update({
      status: 'FINISHED',
      settled_at: new Date(),
      total_pool: totalPoolCents / 100,
      winning_pattern: winners.length ? winners[0].pattern : null,
    });
    io.to(roomId).emit('winner', {
      winners: winners.map((winner) => ({
        userId: winner.userId,
        telegramId: winner.telegramId,
        patterns: winner.pattern ? [winner.pattern] : [],
        card: winner.card,
      })),
      payout: {
        winnerPayout: payoutPerWinner,
        totalPool: totalPoolCents / 100,
        winnerCount,
      },
    });
    game.stopped = true;
    if (game.interval) { clearInterval(game.interval); game.interval = null; }
    if (game.refundTimer) { clearTimeout(game.refundTimer); game.refundTimer = null; }
    activeGames.delete(roomId);
  } catch (err) {
    console.error(err);
  }
}


async function deductBalance(userId, amount) {
  try {
    const user = await db('users').where({ id: userId }).first();
    if (user) {
      await db('users').where({ id: userId }).decrement('wallet_balance', amount);
    }
  } catch (err) {
    console.warn('deductBalance error:', err && err.message ? err.message : err);
  }
}


module.exports = { setupSocket, activeGames, rooms, parseUser, recoverRunningGames, startRoomGame, startGame, startCountdown, getAllowedPatterns, getSelectedPatterns, validatePatternSelection };

function getLetterForNumber(num) {
  if (num <= 15) return 'B';
  if (num <= 30) return 'I';
  if (num <= 45) return 'N';
  if (num <= 60) return 'G';
  return 'O';
}

function startGame(io, roomId, rooms, ..._args) {
  const roomStore = rooms || _args[0] || rooms;
  const room = roomStore[roomId];
  if (!room || Object.keys(room.players).length < 2) return;

  room.status = 'PLAYING';
  if (io) io.to(roomId).emit('game_started');

  if (room.intervalId) clearInterval(room.intervalId);
  room.intervalId = setInterval(() => {
    if (room.calledNumbers.size === 75) {
      clearInterval(room.intervalId);
      room.intervalId = null;
      room.status = 'ENDED';
      if (io) io.to(roomId).emit('game_over', { winner: null, reason: 'All numbers called without a Bingo.' });
      return;
    }

    let number;
    do {
      number = Math.floor(Math.random() * 75) + 1;
    } while (room.calledNumbers.has(number));

    room.calledNumbers.add(number);
    const letter = getLetterForNumber(number);

    if (io) io.to(roomId).emit('new_number_called', { number, letter });
  }, 5000);
}

function startCountdown(io, roomId, rooms, seconds = 40, ..._args) {
  const roomStore = rooms || _args[0] || rooms;
  const room = roomStore[roomId];
  if (!room) return;

  room.status = 'COUNTDOWN';
  if (io) io.to(roomId).emit('room_update', { players: Object.keys(room.players).length, stake: room.stake, status: room.status });
  let timeLeft = seconds;

  const countdownInterval = setInterval(() => {
    timeLeft--;
    if (io) io.to(roomId).emit('countdown_tick', { timeLeft });

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      startGame(io, roomId, roomStore);
    }
  }, 1000);
}

module.exports = { setupSocket, activeGames, rooms, parseUser, recoverRunningGames, startRoomGame, startGame, startCountdown, getLetterForNumber, getAllowedPatterns, getSelectedPatterns, validatePatternSelection };