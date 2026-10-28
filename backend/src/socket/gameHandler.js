const { Server } = require('socket.io');
const db = require('../db/knex');
const { validateTelegramInitData } = require('../middleware/telegramAuth');
const {
  evaluatePatterns,
  closingNumberInPattern,
  DEFAULT_ALLOWED_PATTERNS,
  isPatternSupported,
  normalizePattern,
} = require('../utils/claimValidator');
const { isDemoMode } = require('../config/env');
const { processRoomPayout } = require('../services/payoutService');
const { processRoomRefund } = require('../services/refundService');
const { REFUND_GRACE_MS } = require('../config/gameLimits');
const { MIN_PLAYERS } = require('../services/payoutCalc');
const { createDrawPool, validateDrawPool } = require('../utils/drawEngine');

const activeGames = new Map();
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
        // A claim during the grace window can win only if one of its eligible
        // patterns includes the last called number (the 75th), because
        // claim_bingo filters completed patterns with closingNumberInPattern.
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
      if (Boolean(room.is_demo) !== isDemoMode()) throw new Error('Room mode mismatch');
      if (room.status !== 'WAITING') throw new Error('Room not available');
      if (room.registration_ends_at && new Date(room.registration_ends_at).getTime() > Date.now()) throw new Error('Registration is still open');
      const participants = await trx('room_participants').where({ room_id: roomId });
      if (participants.length < MIN_PLAYERS) throw new Error('At least 2 players are required');
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

    socket.on('join_room', async ({ roomId }) => {
      try {
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) { socket.emit('error', { message: 'User not found' }); return; }
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
        if (!participant) { socket.emit('error', { message: 'Not a participant' }); return; }
        const room = await db('game_rooms').where({ id: roomId }).first();
        if (!room || Boolean(room.is_demo) !== isDemoMode()) { socket.emit('error', { message: 'Room mode mismatch' }); return; }
        currentRoom = roomId;
        socket.join(roomId);
        if (room.status === 'RUNNING') {
          await recoverActiveGame(io, roomId);
        }
        const participants = await db('room_participants').where({ room_id: roomId });
        socket.emit('room_state', {
          room,
          card: participant.card,
          drawn: room.drawn_numbers || [],
          drawIndex: room.draw_index || 0,
          latestNumber: room.latest_number,
          winningPatterns: room.winning_patterns || null,
          participants: participants.map((p) => ({ user_id: p.user_id })),
        });
        io.to(roomId).emit('player_joined', { userId: user.id, count: participants.length });
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: 'Join room failed' });
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

    socket.on('claim_bingo', async ({ roomId }) => {
      try {
        const game = await recoverActiveGame(io, roomId);
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) { socket.emit('claim_result', { valid: false, reason: 'User not found' }); return; }
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
        if (!participant) { socket.emit('claim_result', { valid: false, reason: 'Not a participant' }); return; }
        const room = await db('game_rooms').where({ id: roomId }).first();
        if (!room || Boolean(room.is_demo) !== isDemoMode()) { socket.emit('claim_result', { valid: false, reason: 'Room mode mismatch' }); return; }
        const drawnNumbers = Array.isArray(room.drawn_numbers) ? room.drawn_numbers : (game ? game.drawn : []);
        const latestNumber = room.latest_number === undefined ? (drawnNumbers.length ? drawnNumbers[drawnNumbers.length - 1] : null) : room.latest_number;
        const allowedPatterns = getAllowedPatterns(room);
        const cardValidation = validateCard(participant.card);
        if (!cardValidation.valid) {
          socket.emit('claim_result', { valid: false, reason: 'Invalid card' });
          return;
        }
        const completedPatterns = evaluatePatterns(participant.card, drawnNumbers, allowedPatterns);
        const eligiblePatterns = completedPatterns.filter((pattern) => closingNumberInPattern(participant.card, pattern, latestNumber));
        if (eligiblePatterns.length === 0) {
          const reason = completedPatterns.length === 0 ? 'No winning pattern' : 'Closing number not in claimed pattern';
          socket.emit('claim_result', { valid: false, patterns: completedPatterns, reason });
          return;
        }
        if (room.status !== 'RUNNING') {
          socket.emit('claim_result', { valid: false, reason: room.status === 'FINISHED' ? 'Already won' : 'Room not available' });
          return;
        }
        let payoutInfo = null;
        try {
          await db.transaction(async (trx) => {
            const lockedRoom = await trx('game_rooms').where({ id: roomId }).forUpdate().first();
            if (!lockedRoom || Boolean(lockedRoom.is_demo) !== isDemoMode()) throw new Error('Room mode mismatch');
            if (lockedRoom.status !== 'RUNNING') throw new Error('Room already settled');
            const lockedParticipant = await trx('room_participants').where({ room_id: roomId, user_id: user.id }).first();
            if (!lockedParticipant) throw new Error('Not a participant');
            const lockedDrawn = Array.isArray(lockedRoom.drawn_numbers) ? lockedRoom.drawn_numbers : [];
            const lockedLatest = lockedRoom.latest_number === undefined ? (lockedDrawn.length ? lockedDrawn[lockedDrawn.length - 1] : null) : lockedRoom.latest_number;
            const lockedAllowed = getAllowedPatterns(lockedRoom);
            const lockedCompleted = evaluatePatterns(lockedParticipant.card, lockedDrawn, lockedAllowed);
            const lockedEligible = lockedCompleted.filter((pattern) => closingNumberInPattern(lockedParticipant.card, pattern, lockedLatest));
            if (lockedEligible.length === 0) throw new Error('No eligible winning pattern');
            await trx('room_participants').where({ id: lockedParticipant.id }).update({ is_winner: true });
            await trx('game_rooms').where({ id: roomId, status: 'RUNNING' }).update({
              status: 'RESOLVING',
              winner_id: user.id,
              winning_pattern: lockedEligible[0],
              claim_closing_number: lockedLatest,
              claimed_at: new Date(),
              claim_user_id: user.id,
            });
            payoutInfo = await processRoomPayout(trx, roomId, user.id, { transaction: trx });
            await trx('game_rooms').where({ id: roomId }).update({
              status: 'FINISHED',
              settled_at: new Date(),
              settlement_reference: 'ROOM_' + roomId,
              total_pool: payoutInfo.totalPool,
            });
          });
        } catch (err) {
          console.error(err);
          const reason = err && err.message === 'Room already settled' ? 'Already won' : (err && err.message ? err.message : 'Claim failed');
          socket.emit('claim_result', { valid: false, patterns: eligiblePatterns, reason });
          return;
        }
        if (game) {
          game.stopped = true;
          if (game.interval) {
            clearInterval(game.interval);
            game.interval = null;
          }
          if (game.refundTimer) {
            clearTimeout(game.refundTimer);
            game.refundTimer = null;
          }
        }
        activeGames.delete(roomId);
        io.to(roomId).emit('winner', { userId: user.id, telegramId: socket.tgUser.id, patterns: eligiblePatterns, payout: payoutInfo });
        socket.emit('claim_result', { valid: true, patterns: eligiblePatterns, payout: payoutInfo });
      } catch (err) {
        console.error(err);
        socket.emit('claim_result', { valid: false, reason: 'Error' });
      }
    });

    socket.on('leave_room', () => { if (currentRoom) socket.leave(currentRoom); currentRoom = null; });
    socket.on('disconnect', () => { if (currentRoom) socket.leave(currentRoom); });
  });
  return io;
}

async function recoverRunningGames(io) {
  const rooms = await db('game_rooms').where({ status: 'RUNNING' });
  for (const room of rooms) {
    await recoverActiveGame(io, room.id);
  }
}

module.exports = { setupSocket, activeGames, parseUser, recoverRunningGames, startRoomGame };
