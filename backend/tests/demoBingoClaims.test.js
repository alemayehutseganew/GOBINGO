process.env.DEMO_MODE = 'true';
process.env.DEMO_INITIAL_BALANCE = '100';

const http = require('http');
const { io: Client } = require('socket.io-client');
const request = require('supertest');
const app = require('../src/app');
const { setupSocket, activeGames } = require('../src/socket/gameHandler');
const { cleanDb, db } = require('./helpers');

const PLAYER_TG = [940001, 940002, 940003, 940004, 940005, 940006];
const WINNER_TG = PLAYER_TG[0];

async function login(tgId) {
  await request(app).post('/api/auth/login').set('x-dev-user', JSON.stringify({ id: tgId, first_name: 'Player', username: 'player' + tgId })).send({});
}

describe('Demo Bingo claims', () => {
  let httpServer;
  let io;
  let port;
  let roomId;

  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';
    await cleanDb();
    httpServer = http.createServer(app);
    io = setupSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(0, resolve));
    port = httpServer.address().port;
    await Promise.all(PLAYER_TG.map((tgId) => login(tgId)));
    const users = await db('users').whereIn('telegram_id', PLAYER_TG);
    const userByTg = Object.fromEntries(users.map((u) => [u.telegram_id, u]));
    roomId = (await db('game_rooms').insert({ level: 1, entry_fee: 10, status: 'RUNNING', is_demo: true }).returning('id'))[0].id;
    if (typeof roomId === 'object') roomId = roomId.id;
    for (const tgId of PLAYER_TG) {
      await db('room_participants').insert({ room_id: roomId, user_id: userByTg[tgId].id, card: JSON.stringify([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]]) });
    }
    await db('game_rooms').where({ id: roomId }).update({ drawn_numbers: JSON.stringify([1, 2, 3, 4, 5]) });
    activeGames.set(roomId, { interval: null, drawn: [1, 2, 3, 4, 5], stopped: false });
  });

  afterAll(async () => {
    activeGames.forEach((g) => { g.stopped = true; if (g.interval) clearInterval(g.interval); });
    activeGames.clear();
    if (io) await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
    await cleanDb();
  });

  it('rejects an invalid Bingo claim', async () => {
    const user = await db('users').where({ telegram_id: WINNER_TG }).first();
    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
    await db('room_participants').where({ id: participant.id }).update({ card: JSON.stringify([[9, 9, 9, 9, 9], [9, 9, 9, 9, 9], [9, 9, 0, 9, 9], [9, 9, 9, 9, 9], [9, 9, 9, 9, 9]]) });
    const client = Client(`http://localhost:${port}`, { auth: { devUser: JSON.stringify({ id: WINNER_TG, first_name: 'Player', username: 'player' + WINNER_TG }) }, transports: ['websocket'] });
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => { client.on('room_state', resolve); client.emit('join_room', { roomId }); });
    const result = await new Promise((resolve) => {
      client.on('claim_result', resolve);
      client.emit('claim_bingo', { roomId });
    });
    expect(result.valid).toBe(false);
    client.close();
  });

  it('accepts a valid Bingo claim and prevents duplicate settlement', async () => {
    const user = await db('users').where({ telegram_id: WINNER_TG }).first();
    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
    await db('room_participants').where({ id: participant.id }).update({ card: JSON.stringify([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 0, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]]) });
    const client = Client(`http://localhost:${port}`, { auth: { devUser: JSON.stringify({ id: WINNER_TG, first_name: 'Player', username: 'player' + WINNER_TG }) }, transports: ['websocket'] });
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => { client.on('room_state', resolve); client.emit('join_room', { roomId }); });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No claim result')), 5000);
      client.on('claim_result', (payload) => { clearTimeout(timer); resolve(payload); });
      client.emit('claim_bingo', { roomId });
    });
    expect(result.valid).toBe(true);
    client.close();
    const room = await db('game_rooms').where({ id: roomId }).first();
    expect(room.status).toBe('FINISHED');
  });
});
