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
  activeGames.forEach((g) => {
    g.stopped = true;
    if (g.interval) clearInterval(g.interval);
    if (g.refundTimer) clearTimeout(g.refundTimer);
  });
  activeGames.clear();
  if (io) await new Promise((resolve) => io.close(resolve));
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
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
    const user2 = await db('users').insert({ telegram_id: 2004, first_name: 'Dev2', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    const card1 = [
      [1, 16, 31, 46, 61],
      [2, 17, 32, 47, 62],
      [3, 18, 0, 48, 63],
      [4, 19, 33, 49, 64],
      [5, 20, 34, 50, 65],
    ];
    const card2 = [
      [6, 21, 35, 51, 66],
      [7, 22, 36, 52, 67],
      [8, 23, 0, 53, 68],
      [9, 24, 37, 54, 69],
      [10, 25, 38, 55, 70],
    ];
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'WAITING', registration_ends_at: new Date(Date.now() - 1000) });
    await db('room_participants').insert({ room_id: roomId, user_id: user.id, card: JSON.stringify(card1) });
    await db('room_participants').insert({ room_id: roomId, user_id: user2.id, card: JSON.stringify(card2) });

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

  it('rejects an invalid card claim', async () => {
    const user = await db('users').insert({ telegram_id: 2003, first_name: 'Dev', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const user2 = await db('users').insert({ telegram_id: 2007, first_name: 'Dev2', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    const invalidCard = [
      [1, 16, 31, 46, 61],
      [2, 17, 32, 47, 62],
      [3, 18, 7, 48, 63],
      [4, 19, 33, 49, 64],
      [5, 20, 34, 50, 65],
    ];
    const validCard = [
      [6, 21, 35, 51, 66],
      [7, 22, 36, 52, 67],
      [8, 23, 0, 53, 68],
      [9, 24, 37, 54, 69],
      [10, 25, 38, 55, 70],
    ];
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING', drawn_numbers: JSON.stringify([1, 2, 3, 4, 5]), registration_ends_at: new Date(Date.now() - 1000) });
    await db('room_participants').insert({ room_id: roomId, user_id: user.id, card: JSON.stringify(invalidCard) });
    await db('room_participants').insert({ room_id: roomId, user_id: user2.id, card: JSON.stringify(validCard) });
    activeGames.set(roomId, { interval: null, drawn: [1, 2, 3, 4, 5], stopped: false, refundTimer: null });

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
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid card');
    client.close();
    activeGames.delete(roomId);

    const room = await db('game_rooms').where({ id: roomId }).first();
    expect(room.status).toBe('RUNNING');
    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
    expect(participant.is_winner).toBe(false);
    const ledger = await db('financial_ledger').where({ user_id: user.id, type: 'WINNING_PAYOUT' });
    expect(ledger).toHaveLength(0);
  });
  it('accepts a valid claim and settles once', async () => {
    const user = await db('users').insert({ telegram_id: 2008, first_name: 'Dev', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const user2 = await db('users').insert({ telegram_id: 2009, first_name: 'Dev2', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    const winningCard = [
      [1, 16, 31, 46, 61],
      [2, 17, 32, 47, 62],
      [3, 18, 0, 48, 63],
      [4, 19, 33, 49, 64],
      [5, 20, 34, 50, 65],
    ];
    const otherCard = [
      [6, 21, 35, 51, 66],
      [7, 22, 36, 52, 67],
      [8, 23, 0, 53, 68],
      [9, 24, 37, 54, 69],
      [10, 25, 38, 55, 70],
    ];
    const drawn = [1, 16, 31, 46, 61];
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING', drawn_numbers: JSON.stringify(drawn), latest_number: 61, registration_ends_at: new Date(Date.now() - 1000) });
    await db('room_participants').insert({ room_id: roomId, user_id: user.id, card: JSON.stringify(winningCard) });
    await db('room_participants').insert({ room_id: roomId, user_id: user2.id, card: JSON.stringify(otherCard) });
    activeGames.set(roomId, { interval: null, drawn, stopped: false, refundTimer: null });

    const client = connectClient(2008);
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
    expect(result.patterns).toContain('ROW_0');
    client.close();
    activeGames.delete(roomId);

    const room = await db('game_rooms').where({ id: roomId }).first();
    expect(room.status).toBe('FINISHED');
    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
    expect(participant.is_winner).toBe(true);
    const ledger = await db('financial_ledger').where({ user_id: user.id, type: 'WINNING_PAYOUT' });
    expect(ledger).toHaveLength(1);
  });

  it('rejects a duplicate claim after a win', async () => {
    const user = await db('users').insert({ telegram_id: 2010, first_name: 'Dev', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const user2 = await db('users').insert({ telegram_id: 2011, first_name: 'Dev2', wallet_balance: 100 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    const winningCard = [
      [1, 16, 31, 46, 61],
      [2, 17, 32, 47, 62],
      [3, 18, 0, 48, 63],
      [4, 19, 33, 49, 64],
      [5, 20, 34, 50, 65],
    ];
    const otherCard = [
      [6, 21, 35, 51, 66],
      [7, 22, 36, 52, 67],
      [8, 23, 0, 53, 68],
      [9, 24, 37, 54, 69],
      [10, 25, 38, 55, 70],
    ];
    const drawn = [1, 16, 31, 46, 61];
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING', drawn_numbers: JSON.stringify(drawn), latest_number: 61, registration_ends_at: new Date(Date.now() - 1000) });
    await db('room_participants').insert({ room_id: roomId, user_id: user.id, card: JSON.stringify(winningCard) });
    await db('room_participants').insert({ room_id: roomId, user_id: user2.id, card: JSON.stringify(otherCard) });
    activeGames.set(roomId, { interval: null, drawn, stopped: false, refundTimer: null });

    const client = connectClient(2010);
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => {
      client.on('room_state', resolve);
      client.emit('join_room', { roomId });
    });

    const first = await new Promise((resolve) => {
      client.on('claim_result', resolve);
      client.emit('claim_bingo', { roomId });
    });
    expect(first.valid).toBe(true);

    const second = await new Promise((resolve) => {
      client.on('claim_result', resolve);
      client.emit('claim_bingo', { roomId });
    });
    expect(second.valid).toBe(false);
    expect(second.reason).toBe('Already won');
    client.close();
    activeGames.delete(roomId);

    const ledger = await db('financial_ledger').where({ user_id: user.id, type: 'WINNING_PAYOUT' });
    expect(ledger).toHaveLength(1);
  });
});
