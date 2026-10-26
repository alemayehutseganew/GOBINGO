const request = require('supertest');
const http = require('http');
const { io: Client } = require('socket.io-client');
const app = require('../src/app');
const { setupSocket, activeGames } = require('../src/socket/gameHandler');
const { cleanDb, db } = require('./helpers');
const { isMockProviderEnabled, assertMockProviderAllowed } = require('../src/services/mockPaymentService');
const { processRoomPayout } = require('../src/services/payoutService');
const crypto = require('crypto');

const PLAYER_TG = [910001, 910002, 910003, 910004, 910005, 910006];
const WINNER_TG = PLAYER_TG[0];
const AGENT_TG = 920001;

function devHeader(tgId) {
  return { 'x-dev-user': JSON.stringify({ id: tgId, first_name: 'Player', username: 'player' + tgId }), 'Content-Type': 'application/json' };
}

async function login(tgId) {
  await request(app).post('/api/auth/login').set('x-dev-user', JSON.stringify({ id: tgId, first_name: 'Player', username: 'player' + tgId })).send({});
}

async function depositSuccess(tgId, amount) {
  const headers = devHeader(tgId);
  const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount });
  expect(dep.status).toBe(200);
  const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;
  expect(outTradeNo).toBeTruthy();
  const confirm = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo, amount, outcome: 'success' });
  expect(confirm.status).toBe(200);
  expect(confirm.body.status).toBe('COMPLETED');
  return outTradeNo;
}

let httpServer;
let io;
let port;

beforeAll(async () => {
  await cleanDb();
  httpServer = http.createServer(app);
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

describe('Mock mode guards', () => {
  it('allows mock payments in development', () => {
    expect(isMockProviderEnabled()).toBe(true);
    expect(() => assertMockProviderAllowed()).not.toThrow();
  });

  it('rejects mock payments in production', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldProvider = process.env.PAYMENT_PROVIDER;
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_PROVIDER = 'mock';
    expect(() => assertMockProviderAllowed()).toThrow();
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldProvider === undefined) delete process.env.PAYMENT_PROVIDER; else process.env.PAYMENT_PROVIDER = oldProvider;
  });
});

describe('Mock deposits and idempotency', () => {
  beforeEach(async () => {
    await cleanDb();
    await login(PLAYER_TG[0]);
    await db('users').where({ telegram_id: PLAYER_TG[0] }).update({ wallet_balance: 0 });
  });

  it('credits a successful deposit exactly once and ignores duplicate confirmation', async () => {
    const headers = devHeader(PLAYER_TG[0]);
    const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 10, phoneNumber: '0912345678' });
    expect(dep.status).toBe(200);
    const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;
    expect(outTradeNo).toBeTruthy();

    const first = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo, amount: 10, outcome: 'success' });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('COMPLETED');
    expect(first.body.already).not.toBe(true);

    const userAfterFirst = await db('users').where({ telegram_id: PLAYER_TG[0] }).first();
    expect(Number(userAfterFirst.wallet_balance)).toBe(10);

    const deposits = await db('deposits').where({ merchant_order_id: outTradeNo });
    expect(deposits.length).toBe(1);
    expect(deposits[0].status).toBe('COMPLETED');

    const ledgerBefore = await db('financial_ledger').where({ user_id: userAfterFirst.id, type: 'DEPOSIT' });
    expect(ledgerBefore.length).toBe(1);

    const duplicate = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo, amount: 10, outcome: 'success' });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.already).toBe(true);

    const userAfterDuplicate = await db('users').where({ telegram_id: PLAYER_TG[0] }).first();
    expect(Number(userAfterDuplicate.wallet_balance)).toBe(10);

    const ledgerAfter = await db('financial_ledger').where({ user_id: userAfterFirst.id, type: 'DEPOSIT' });
    expect(ledgerAfter.length).toBe(1);
  });

  it('records failed, cancelled, and pending outcomes without crediting', async () => {
    const headers = devHeader(PLAYER_TG[0]);
    for (const outcome of ['failed', 'cancelled', 'pending']) {
      const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 5 });
      const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;
      const res = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo, outcome });
      expect(res.status).toBe(200);
      expect(['FAILED', 'CANCELLED', 'PENDING'].includes(res.body.status)).toBeTruthy();
    }
    const user = await db('users').where({ telegram_id: PLAYER_TG[0] }).first();
    expect(Number(user.wallet_balance)).toBe(0);
  });

  it('rejects invalid amount, invalid reference, and unauthorized confirmation', async () => {
    const headers = devHeader(PLAYER_TG[0]);
    const invalidAmount = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 0 });
    expect(invalidAmount.status).toBe(400);

    const invalidRef = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo: 'NOPE', outcome: 'success' });
    expect(invalidRef.status).toBe(404);

    const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 5 });
    const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;

    await login(PLAYER_TG[1]);
    const otherHeaders = devHeader(PLAYER_TG[1]);
    const unauthorized = await request(app).post('/api/telebirr/mock/confirm').set(otherHeaders).send({ outTradeNo, outcome: 'success' });
    expect(unauthorized.status).toBe(403);

    const noAuth = await request(app).get('/api/wallet/balance');
    expect(noAuth.status).toBe(401);
  });
});

describe('Room join, fees, and insufficient balance', () => {
  beforeEach(async () => {
    await cleanDb();
    for (const tgId of PLAYER_TG) {
      await login(tgId);
      await db('users').where({ telegram_id: tgId }).update({ wallet_balance: 20 });
    }
  });

  it('joins players, deducts entry fees, and returns 5x5 cards', async () => {
    let roomId = null;
    for (const tgId of PLAYER_TG.slice(0, 2)) {
      const res = await request(app).post('/api/rooms/join').set(devHeader(tgId)).send({ level: 1 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.card)).toBe(true);
      expect(res.body.card.length).toBe(5);
      if (!roomId) roomId = res.body.room.id;
      else expect(res.body.room.id).toBe(roomId);
    }

    const participants = await db('room_participants').where({ room_id: roomId });
    expect(participants.length).toBe(2);

    for (const tgId of PLAYER_TG.slice(0, 2)) {
      const user = await db('users').where({ telegram_id: tgId }).first();
      expect(Number(user.wallet_balance)).toBe(10);
    }
  });

  it('rejects joining with insufficient balance', async () => {
    await db('users').where({ telegram_id: PLAYER_TG[0] }).update({ wallet_balance: 0 });
    const res = await request(app).post('/api/rooms/join').set(devHeader(PLAYER_TG[0])).send({ level: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Insufficient balance');
  });
});

describe('Full mock-funded game, settlement, and idempotency', () => {
  let roomId;

  beforeEach(async () => {
    await cleanDb();
    for (const tgId of PLAYER_TG) {
      await login(tgId);
      await db('users').where({ telegram_id: tgId }).update({ wallet_balance: 10 });
    }

    const [agentUser] = await db('users').insert({ telegram_id: AGENT_TG, first_name: 'Agent', telegram_username: 'agentuser', wallet_balance: 0 }).returning('*');
    await db('agents').insert({ user_id: agentUser.id, telegram_username: 'agent1', commission_balance: 0 });
    await db('users').where({ telegram_id: WINNER_TG }).update({ agent_username: 'agent1' });

    roomId = null;
    for (const tgId of PLAYER_TG) {
      const res = await request(app).post('/api/rooms/join').set(devHeader(tgId)).send({ level: 1 });
      expect(res.status).toBe(200);
      if (!roomId) roomId = res.body.room.id;
    }

    const participants = await db('room_participants').where({ room_id: roomId });
    expect(participants.length).toBe(6);

    const winner = await db('users').where({ telegram_id: WINNER_TG }).first();
    const winnerParticipant = await db('room_participants').where({ room_id: roomId, user_id: winner.id }).first();
    const winningCard = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 0, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]];
    await db('room_participants').where({ id: winnerParticipant.id }).update({ card: JSON.stringify(winningCard) });
    await db('game_rooms').where({ id: roomId }).update({ status: 'RUNNING', drawn_numbers: JSON.stringify([1, 2, 3, 4, 5]) });

    activeGames.set(roomId, { interval: null, drawn: [1, 2, 3, 4, 5], stopped: false });
  });

  afterEach(() => {
    if (activeGames.has(roomId)) {
      const g = activeGames.get(roomId);
      g.stopped = true;
      if (g.interval) clearInterval(g.interval);
      activeGames.delete(roomId);
    }
  });

  it('settles the game once, credits winner, platform fee, and referral commission', async () => {
    const client = Client(`http://localhost:${port}`, {
      auth: { devUser: JSON.stringify({ id: WINNER_TG, first_name: 'Player', username: 'player' + WINNER_TG }) },
      transports: ['websocket'],
    });
    await new Promise((resolve) => client.on('connect', resolve));

    await new Promise((resolve) => {
      client.on('room_state', resolve);
      client.emit('join_room', { roomId });
    });

    const winnerEvent = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No winner event')), 5000);
      client.on('winner', (payload) => { clearTimeout(timer); resolve(payload); });
      client.on('claim_result', (payload) => {
        if (payload.valid === false) {
          clearTimeout(timer);
          reject(new Error(payload.reason || 'Claim failed'));
        }
      });
    });

    client.emit('claim_bingo', { roomId });
    const result = await winnerEvent;
    expect(result.payout.winnerPayout).toBe(50);
    expect(result.payout.platformCommission).toBe(9);
    expect(result.payout.agentCommission).toBe(1);
    expect(result.payout.totalPool).toBe(60);

    client.close();

    const room = await db('game_rooms').where({ id: roomId }).first();
    expect(room.status).toBe('FINISHED');

    const winnerUser = await db('users').where({ telegram_id: WINNER_TG }).first();
    expect(Number(winnerUser.wallet_balance)).toBe(50);

    const agent = await db('agents').where({ telegram_username: 'agent1' }).first();
    expect(Number(agent.commission_balance)).toBe(1);

    const payoutLedger = await db('financial_ledger').where({ type: 'WINNING_PAYOUT' });
    expect(payoutLedger.length).toBe(1);
    const commissionLedger = await db('financial_ledger').where({ type: 'AGENT_COMMISSION' });
    expect(commissionLedger.length).toBe(1);

    const winnerDb = await db('users').where({ telegram_id: WINNER_TG }).first();
    await expect(processRoomPayout(db, roomId, winnerDb.id)).rejects.toThrow();
    const payoutLedgerAfter = await db('financial_ledger').where({ type: 'WINNING_PAYOUT' });
    expect(payoutLedgerAfter.length).toBe(1);
    const commissionLedgerAfter = await db('financial_ledger').where({ type: 'AGENT_COMMISSION' });
    expect(commissionLedgerAfter.length).toBe(1);
  });
});
