const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/knex');
const { telegramAuthMiddleware } = require('../middleware/telegramAuth');
const { generateSingleCard } = require('../game/cardGenerator');
const { isDemoMode } = require('../config/env');
const { DEFAULT_GAME_PATTERNS } = require('../game/ethioValidator');
const MAX_CARDS_PER_PLAYER = 2;
const CARD_POOL_SIZE = 400;
const REGISTRATION_DURATION_MS = Number(process.env.REGISTRATION_DURATION_MS || 30000);

const limiter = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 40, standardHeaders: true, legacyHeaders: false });
router.use(limiter);

const ENTRY_FEES = { 1: 10, 2: 25, 3: 50 };
const { MAX_PLAYERS } = require('../config/gameLimits');

router.get('/', async (req, res) => {
  try {
    const rooms = await db('game_rooms').where({ status: 'WAITING', is_demo: isDemoMode() }).orderBy('created_at', 'desc').limit(50);
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/join', telegramAuthMiddleware, async (req, res) => {
  try {
    const level = Number(req.body.level);
    if (![1, 2, 3].includes(level)) return res.status(400).json({ error: 'Invalid level' });
    const entryFee = ENTRY_FEES[level];
    const demoMode = isDemoMode();
    const balanceField = demoMode ? 'demo_wallet_balance' : 'wallet_balance';
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    try {
      const result = await db.transaction(async (trx) => {
        const lockedUser = await trx('users').where({ id: user.id }).forUpdate().first();
        if (Number(lockedUser[balanceField]) < entryFee) throw new Error('Insufficient balance');

        let room = await trx('game_rooms').where({ level, status: 'WAITING', is_demo: demoMode }).forUpdate().first();
        if (room) {
          const countRow = await trx('room_participants').where({ room_id: room.id }).count('* as c').first();
          if (Number(countRow.c) >= MAX_PLAYERS) room = null;
        }
        if (!room) {
          const cardPool = Array.from({ length: CARD_POOL_SIZE }, (_, index) => index + 1);
          const [created] = await trx('game_rooms').insert({ id: crypto.randomUUID(), level, entry_fee: entryFee, status: 'WAITING', is_demo: demoMode, registration_ends_at: new Date(Date.now() + REGISTRATION_DURATION_MS), card_pool: JSON.stringify(cardPool), winning_patterns: JSON.stringify(DEFAULT_GAME_PATTERNS) }).returning('*');
          room = created;
        }

        const existing = await trx('room_participants').where({ room_id: room.id, user_id: user.id }).first();
        if (existing) {
          return { room, card: null, selectedCards: [], alreadyJoined: true };
        }

        await trx('users').where({ id: user.id }).decrement(balanceField, entryFee);
        await trx('room_participants').insert({ room_id: room.id, user_id: user.id, card: JSON.stringify([]) });
        await trx('financial_ledger').insert({
          user_id: user.id,
          amount: -entryFee,
          type: demoMode ? 'DEMO_ENTRY_FEE' : 'ENTRY_FEE',
          reference_id: `ROOM_${room.id}`,
          is_demo: demoMode,
        });
        return { room, card: null, selectedCards: [], alreadyJoined: false };
      });

      return res.json({ room: result.room, card: result.card, selectedCards: result.selectedCards || [] });
    } catch (err) {
      if (err.message === 'Insufficient balance') return res.status(400).json({ error: 'Insufficient balance' });
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Join failed' });
  }
});

router.get('/:id', telegramAuthMiddleware, async (req, res) => {
  try {
    const room = await db('game_rooms').where({ id: req.params.id }).first();
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (Boolean(room.is_demo) !== isDemoMode()) return res.status(404).json({ error: 'Room not found' });
    const participants = await db('room_participants').where({ room_id: room.id });
    res.json({ room, participants: participants.map((p) => ({ user_id: p.user_id, joined_at: p.joined_at })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/:id/cards', telegramAuthMiddleware, async (req, res) => {
  try {
    const room = await db('game_rooms').where({ id: req.params.id }).first();
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (Boolean(room.is_demo) !== isDemoMode()) return res.status(404).json({ error: 'Room not found' });

    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const selections = await db('room_card_selections').where({ room_id: room.id });
    const ownerByCard = new Map(selections.map((row) => [row.card_id, row.user_id]));
    const cardPool = Array.isArray(room.card_pool)
      ? room.card_pool
      : Array.from({ length: CARD_POOL_SIZE }, (_, index) => index + 1);
    const cards = cardPool.map((cardId) => {
      const ownerId = ownerByCard.get(cardId);
      let status = 'available';
      if (ownerId === user.id) status = 'selected';
      else if (ownerId !== undefined) status = 'taken';
      return { cardId, status };
    });

    const selectedCards = selections
      .filter((row) => row.user_id === user.id)
      .map((row) => ({ cardId: row.card_id, card: row.card }));

    return res.json({
      roomId: room.id,
      registrationOpen: registrationOpen(room),
      registrationEndsAt: room.registration_ends_at,
      maxCardsPerPlayer: MAX_CARDS_PER_PLAYER,
      selectedCardIds: selectedCards.map((item) => item.cardId),
      selectedCards,
      cards,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load card board' });
  }
});

router.post('/:id/cards/:cardId', telegramAuthMiddleware, async (req, res) => {
  try {
    const cardId = Number(req.params.cardId);
    if (!Number.isInteger(cardId) || cardId < 1 || cardId > CARD_POOL_SIZE) {
      return res.status(400).json({ error: 'Invalid card ID' });
    }

    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await db.transaction(async (trx) => {
      const room = await trx('game_rooms').where({ id: req.params.id }).forUpdate().first();
      if (!room) throw new Error('Room not found');
      if (Boolean(room.is_demo) !== isDemoMode()) throw new Error('Room not found');
      if (room.status !== 'WAITING' || !registrationOpen(room)) throw new Error('Registration is closed');

      const countRow = await trx('room_card_selections').where({ room_id: room.id, user_id: user.id }).count('* as c').first();
      if (Number(countRow.c) >= MAX_CARDS_PER_PLAYER) throw new Error('Card limit reached');

      const existing = await trx('room_card_selections').where({ room_id: room.id, card_id: cardId }).first();
      if (existing) {
        if (existing.user_id !== user.id) throw new Error('Card already reserved');
        return { cardId, card: existing.card };
      }

      const card = generateSingleCard();
      try {
        await trx('room_card_selections').insert({
          room_id: room.id,
          card_id: cardId,
          user_id: user.id,
          card: JSON.stringify(card),
          status: 'reserved',
        });
      } catch (err) {
        const conflict = await trx('room_card_selections').where({ room_id: room.id, card_id: cardId }).first();
        if (conflict && conflict.user_id !== user.id) throw new Error('Card already reserved');
        if (conflict) return { cardId, card: conflict.card };
        throw err;
      }
      return { cardId, card };
    });

    const io = req.app.get('io');
    if (io) io.to(req.params.id).emit('card_reserved', { roomId: req.params.id, cardId, userId: user.id });
    return res.json(result);
  } catch (err) {
    const status = err.message === 'Room not found' ? 404 : /closed|limit|reserved/i.test(err.message || '') ? 409 : 500;
    return res.status(status).json({ error: err.message || 'Failed to select card' });
  }
});

router.delete('/:id/cards/:cardId', telegramAuthMiddleware, async (req, res) => {
  try {
    const cardId = Number(req.params.cardId);
    if (!Number.isInteger(cardId) || cardId < 1 || cardId > CARD_POOL_SIZE) {
      return res.status(400).json({ error: 'Invalid card ID' });
    }

    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.transaction(async (trx) => {
      const room = await trx('game_rooms').where({ id: req.params.id }).forUpdate().first();
      if (!room) throw new Error('Room not found');
      if (Boolean(room.is_demo) !== isDemoMode()) throw new Error('Room not found');
      if (room.status !== 'WAITING' || !registrationOpen(room)) throw new Error('Registration is closed');

      const deleted = await trx('room_card_selections')
        .where({ room_id: room.id, card_id: cardId, user_id: user.id })
        .del();
      if (!deleted) throw new Error('Card is not reserved by you');
    });

    const io = req.app.get('io');
    if (io) io.to(req.params.id).emit('card_released', { roomId: req.params.id, cardId, userId: user.id });
    return res.json({ cardId, released: true });
  } catch (err) {
    const status = err.message === 'Room not found' ? 404 : /closed|not reserved/i.test(err.message || '') ? 409 : 500;
    return res.status(status).json({ error: err.message || 'Failed to release card' });
  }
});

router.recoverRegistrations = recoverRegistrations;

const { rooms, startRoomGame } = require('../sockets/gameHandler');

const registrationTimers = new Map();

function clearRegistrationTimer(roomId) {
  const timer = registrationTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    registrationTimers.delete(roomId);
  }
}

function registrationOpen(room) {
  if (!room || room.status !== 'WAITING') return false;
  if (!room.registration_ends_at) return true;
  return new Date(room.registration_ends_at).getTime() > Date.now();
}

async function autoStartRoom(io, roomId) {
  if (!io) return;
  try {
    const room = await db('game_rooms').where({ id: roomId }).first();
    if (!room || room.status !== 'WAITING') return;
    if (!registrationOpen(room)) {
      const participants = await db('room_participants').where({ room_id: roomId });
      if (participants.length < 1) return;
      const result = await startRoomGame(io, roomId);
      if (!result.ok) console.warn('[rooms] Auto-start failed:', result.error);
    }
  } catch (err) {
    console.error('[rooms] Auto-start error:', err && err.message ? err.message : err);
  }
}

function scheduleRegistration(roomId, endsAt, io) {
  clearRegistrationTimer(roomId);
  const delay = new Date(endsAt).getTime() - Date.now();
  const run = () => autoStartRoom(io, roomId);
  const timer = delay <= 0 ? setTimeout(run, 0) : setTimeout(run, delay);
  registrationTimers.set(roomId, timer);
}

function recoverRegistrations(io) {
  if (!io) return;
  db('game_rooms')
    .where({ status: 'WAITING' })
    .whereNotNull('registration_ends_at')
    .then((rooms) => {
      for (const room of rooms) {
        if (!registrationOpen(room)) autoStartRoom(io, room.id);
        else scheduleRegistration(room.id, room.registration_ends_at, io);
      }
    })
    .catch((err) => {
      console.warn('[rooms] Registration recovery failed:', err && err.message ? err.message : err);
    });
}

router.get('/:roomId/my-cards', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query; // This is the Telegram ID

    if (!roomId || !userId) {
      return res.status(400).json({ error: 'roomId and userId are required' });
    }

    // 1. Find the DB user by Telegram ID
    const user = await db('users').where({ telegram_id: userId }).first();
    if (!user) {
      console.log(`[my-cards] User not found for telegram_id: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. Fetch selections using the DB user.id
    const selections = await db('room_card_selections').where({ room_id: roomId, user_id: user.id });
    
    console.log(`[my-cards] Found ${selections.length} cards for DB user ${user.id} in room ${roomId}`);

    const cards = selections.map((selection) => ({
      id: selection.card_id,
      matrix: typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card,
    }));

    return res.json({ cards });
  } catch (error) {
    console.error('[my-cards] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

module.exports = router;