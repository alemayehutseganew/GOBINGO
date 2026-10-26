const { Server } = require('http');
const { io: Client } = require('socket.io-client');
const { setupSocket, activeGames } = require('../src/socket/gameHandler');
const { cleanDb, db } = require('./helpers');
const crypto = require('crypto');

let httpServer;
let io;
let port;

beforeAll(async () => {
  await cleanDb();
  httpServer = require('http').createServer();
  io = setupSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  activeGames.forEach((g) => { g.stopped = true; if (g.interval) clearInterval(g.interval); });
  activeGames.clear();
  if (io) await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => httpServer.close(resolve));
});

function connectClient(tgId) {
  return Client(`http://localhost:${port}`, {
    auth: { devUser: JSON.stringify({ id: tgId, first_name: 'Dev', username: 'devuser' }) },
    transports: ['websocket'],
  });
}

describe('Bingo socket', () => {
  it('joins room and receives room_state', async () => {
    const user = await db('users').insert({ telegram_id: 2001, first_name: 'Dev', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'WAITING' });
    await db('room_participants').insert({ room_id: roomId, user_id: user.id, card: JSON.stringify([]) });

    const client = connectClient(2001);
    await new Promise((resolve) => client.on('connect', resolve));
    const state = await new Promise((resolve) => {
      client.on('room_state', resolve);
      client.emit('join_room', { roomId });
    });
    expect(state.room.id).toBe(roomId);
    client.close();
  });

  it('starts game and broadcasts a ball within ~3 seconds', async () => {
    const user = await db('users').insert({ telegram_id: 2002, first_name: 'Dev', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'WAITING' });
    await db('room_participants').insert({ room_id: roomId, user_id: user.id, card: JSON.stringify([]) });

    const client = connectClient(2002);
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => {
      client.on('room_state', resolve);
      client.emit('join_room', { roomId });
    });

    const started = await new Promise((resolve) => {
      client.on('game_started', resolve);
      client.emit('start_game', { roomId });
    });
    expect(started.roomId).toBe(roomId);

    const drawn = await new Promise((resolve) => {
      client.on('number_drawn', resolve);
      setTimeout(() => resolve(null), 5000);
    });
    client.close();
    if (activeGames.has(roomId)) {
      const g = activeGames.get(roomId);
      g.stopped = true;
      if (g.interval) clearInterval(g.interval);
      activeGames.delete(roomId);
    }
  }, 10000);

  it('returns claim_result for a claim', async () => {
    const user = await db('users').insert({ telegram_id: 2003, first_name: 'Dev', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING', drawn_numbers: JSON.stringify([1,2,3,4,5]) });
    const card = [[1,2,3,4,5],[6,7,8,9,10],[11,12,0,14,15],[16,17,18,19,20],[21,22,23,24,25]];
    await db('room_participants').insert({ room_id: roomId, user_id: user.id, card: JSON.stringify(card) });
    activeGames.set(roomId, { interval: null, drawn: [1,2,3,4,5], stopped: false });

    const client = connectClient(2003);
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => {
      client.on('room_state', resolve);
      client.emit('join_room', { roomId });
    });

    const result = await new Promise((resolve) => {
      client.on('claim_result', resolve);
      client.emit('claim_bingo', { roomId });
    });
    expect(result.valid).toBe(true);
    client.close();
    activeGames.delete(roomId);
  });
});
