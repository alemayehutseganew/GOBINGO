const { Server } = require('socket.io');
const db = require('../db/knex');
const { validateTelegramInitData } = require('../middleware/telegramAuth');
const { validateClaim } = require('../utils/claimValidator');
const { isDemoMode } = require('../config/env');

const { processRoomPayout } = require('../services/payoutService');

const activeGames = new Map();

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

function getAllowedOrigins() {
  return (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return origin === 'https://gobingo-rho.vercel.app';
  return allowed.includes(origin);
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
        const participants = await db('room_participants').where({ room_id: roomId });
        socket.emit('room_state', { room, card: participant.card, drawn: room.drawn_numbers || [], participants: participants.map((p) => ({ user_id: p.user_id })) });
        io.to(roomId).emit('player_joined', { userId: user.id, count: participants.length });
      } catch (err) { console.error(err); socket.emit('error', { message: 'Join room failed' }); }
    });

    socket.on('start_game', async ({ roomId }) => {
      try {
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) { socket.emit('error', { message: 'User not found' }); return; }
        const room = await db('game_rooms').where({ id: roomId }).first();
        if (!room || Boolean(room.is_demo) !== isDemoMode()) { socket.emit('error', { message: 'Room mode mismatch' }); return; }
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
        if (!participant) { socket.emit('error', { message: 'Not a participant' }); return; }
        if (room.status !== 'WAITING') { socket.emit('error', { message: 'Room not available' }); return; }
        const participants = await db('room_participants').where({ room_id: roomId });
        if (participants.length < 1) { socket.emit('error', { message: 'Need players' }); return; }
        await db('game_rooms').where({ id: roomId }).update({ status: 'RUNNING', started_at: new Date(), drawn_numbers: [] });

        const drawn = [];
        const game = { interval: null, drawn, stopped: false };
        activeGames.set(roomId, game);
        io.to(roomId).emit('game_started', { roomId });

        const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
        for (let i = allNumbers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
        }
        let idx = 0;
        game.interval = setInterval(async () => {
          if (game.stopped) { clearInterval(game.interval); return; }
          if (idx >= allNumbers.length) { clearInterval(game.interval); return; }
          const num = allNumbers[idx++];
          drawn.push(num);
          await db('game_rooms').where({ id: roomId }).update({ drawn_numbers: JSON.stringify(drawn) });
          io.to(roomId).emit('number_drawn', { number: num, drawn: [...drawn] });
        }, 3000);
      } catch (err) { console.error(err); socket.emit('error', { message: 'Start failed' }); }
    });

    socket.on('claim_bingo', async ({ roomId }) => {
      try {
        const game = activeGames.get(roomId);
        if (!game) { socket.emit('claim_result', { valid: false, reason: 'No active game' }); return; }
        const user = await getUserByTelegramId(socket.tgUser.id);
        if (!user) { socket.emit('claim_result', { valid: false }); return; }
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
        if (!participant) { socket.emit('claim_result', { valid: false }); return; }
        const room = await db('game_rooms').where({ id: roomId }).first();
        if (!room || Boolean(room.is_demo) !== isDemoMode()) { socket.emit('claim_result', { valid: false, reason: 'Room mode mismatch' }); return; }
        const drawnNumbers = room.drawn_numbers || game.drawn;
        const result = validateClaim(participant.card, drawnNumbers);
        if (!result.valid) { socket.emit('claim_result', { valid: false, reason: 'Invalid card', patterns: result.patterns }); return; }
        if (game.stopped) { socket.emit('claim_result', { valid: false, reason: 'Already won' }); return; }
        game.stopped = true;
        if (game.interval) clearInterval(game.interval);
        await db('room_participants').where({ id: participant.id }).update({ is_winner: true });
        let payoutInfo = null;
        try { payoutInfo = await processRoomPayout(db, roomId, user.id); } catch (e) { console.error('Payout error', e); }
        io.to(roomId).emit('winner', { userId: user.id, telegramId: socket.tgUser.id, patterns: result.patterns, payout: payoutInfo });
        socket.emit('claim_result', { valid: true, patterns: result.patterns, payout: payoutInfo });
      } catch (err) { console.error(err); socket.emit('claim_result', { valid: false, reason: 'Error' }); }
    });

    socket.on('leave_room', () => { if (currentRoom) socket.leave(currentRoom); currentRoom = null; });
    socket.on('disconnect', () => { if (currentRoom) socket.leave(currentRoom); });
  });
  return io;
}

module.exports = { setupSocket, activeGames, parseUser };
