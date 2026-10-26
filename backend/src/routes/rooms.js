const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/knex');
const { telegramAuthMiddleware } = require('../middleware/telegramAuth');
const { generateCard } = require('../utils/bingoCard');
const store = require('../services/redisStore');

const limiter = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 40, standardHeaders: true, legacyHeaders: false });
router.use(limiter);

const ENTRY_FEES = { 1: 10, 2: 25, 3: 50 };
const MAX_PLAYERS = 10;

router.get('/', async (req, res) => {
  try {
    const rooms = await db('game_rooms').where({ status: 'WAITING' }).orderBy('created_at', 'desc').limit(50);
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
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    try {
      const result = await db.transaction(async (trx) => {
        const lockedUser = await trx('users').where({ id: user.id }).forUpdate().first();
        if (Number(lockedUser.wallet_balance) < entryFee) throw new Error('Insufficient balance');

        let room = await trx('game_rooms').where({ level, status: 'WAITING' }).first();
        if (room) {
          const countRow = await trx('room_participants').where({ room_id: room.id }).count('* as c').first();
          if (Number(countRow.c) >= MAX_PLAYERS) room = null;
        }
        if (!room) {
          const [created] = await trx('game_rooms').insert({ id: crypto.randomUUID(), level, entry_fee: entryFee, status: 'WAITING' }).returning('*');
          room = created;
        }

        const existing = await trx('room_participants').where({ room_id: room.id, user_id: user.id }).first();
        if (existing) {
          return { room, card: existing.card, alreadyJoined: true };
        }

        const card = generateCard();
        await trx('users').where({ id: user.id }).decrement('wallet_balance', entryFee);
        await trx('room_participants').insert({ room_id: room.id, user_id: user.id, card: JSON.stringify(card) });
        await trx('financial_ledger').insert({
          user_id: user.id,
          amount: -entryFee,
          type: 'ENTRY_FEE',
          reference_id: `ROOM_${room.id}`,
        });
        return { room, card, alreadyJoined: false };
      });

      return res.json({ room: result.room, card: result.card });
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
    const participants = await db('room_participants').where({ room_id: room.id });
    res.json({ room, participants: participants.map(p => ({ user_id: p.user_id, joined_at: p.joined_at })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
