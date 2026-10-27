process.env.DEMO_MODE = 'true';
process.env.DEMO_INITIAL_BALANCE = '100';

const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const { cleanDb, db } = require('./helpers');
const { isDemoMode, getDemoInitialBalance } = require('../src/config/env');
const { processRoomPayout } = require('../src/services/payoutService');

const PLAYER_TG = [930001, 930002, 930003, 930004, 930005, 930006];
const WINNER_TG = PLAYER_TG[0];

function devHeader(tgId) {
  return { 'x-dev-user': JSON.stringify({ id: tgId, first_name: 'Player', username: 'player' + tgId }), 'Content-Type': 'application/json' };
}

async function login(tgId) {
  await request(app).post('/api/auth/login').set('x-dev-user', JSON.stringify({ id: tgId, first_name: 'Player', username: 'player' + tgId })).send({});
}

describe('Demo Mode backend flow', () => {
  const originalDemoMode = process.env.DEMO_MODE;
  const originalInitialBalance = process.env.DEMO_INITIAL_BALANCE;

  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_INITIAL_BALANCE = '100';
    await cleanDb();
  });

  afterAll(async () => {
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
    if (originalInitialBalance === undefined) delete process.env.DEMO_INITIAL_BALANCE;
    else process.env.DEMO_INITIAL_BALANCE = originalInitialBalance;
    await cleanDb();
  });

  beforeEach(async () => { await cleanDb(); });

  it('grants one-time demo credit', async () => {
    await login(PLAYER_TG[0]);
    const user = await db('users').where({ telegram_id: PLAYER_TG[0] }).first();
    expect(Number(user.demo_wallet_balance)).toBe(100);
    expect(user.demo_initial_credit_granted).toBe(true);
    const ledger = await db('financial_ledger').where({ user_id: user.id, type: 'DEMO_CREDIT_GRANT', is_demo: true });
    expect(ledger.length).toBe(1);
    await login(PLAYER_TG[0]);
    const ledgerAfter = await db('financial_ledger').where({ user_id: user.id, type: 'DEMO_CREDIT_GRANT', is_demo: true });
    expect(ledgerAfter.length).toBe(1);
  });

  it('rejects insufficient demo balance', async () => {
    await login(PLAYER_TG[0]);
    const user = await db('users').where({ telegram_id: PLAYER_TG[0] }).first();
    await db('users').where({ id: user.id }).update({ demo_wallet_balance: 0 });
    const res = await request(app).post('/api/rooms/join').set(devHeader(PLAYER_TG[0])).send({ level: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Insufficient balance');
  });

  it('disables payment routes', async () => {
    await login(PLAYER_TG[0]);
    const deposit = await request(app).post('/api/wallet/deposit').set(devHeader(PLAYER_TG[0])).send({ amount: 10 });
    expect(deposit.status).toBe(403);
    const telebirrDeposit = await request(app).post('/api/telebirr/deposit').set(devHeader(PLAYER_TG[0])).send({ amount: 10 });
    expect(telebirrDeposit.status).toBe(403);
    const mockConfirm = await request(app).post('/api/telebirr/mock/confirm').set(devHeader(PLAYER_TG[0])).send({ outTradeNo: 'TXN', outcome: 'success' });
    expect(mockConfirm.status).toBe(403);
  });

  it('settles demo payout once', async () => {
    await Promise.all(PLAYER_TG.map((tgId) => login(tgId)));
    const users = await db('users').whereIn('telegram_id', PLAYER_TG);
    const userByTg = Object.fromEntries(users.map((u) => [u.telegram_id, u]));
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING', is_demo: true });
    const winningCard = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 0, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]];
    for (const tgId of PLAYER_TG) {
      const card = tgId === WINNER_TG ? winningCard : [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]];
      await db('room_participants').insert({ room_id: roomId, user_id: userByTg[tgId].id, card: JSON.stringify(card) });
    }
    await db('agents').insert({ telegram_username: 'agent1', user_id: null, commission_balance: 0, demo_commission_balance: 0 });
    await db('users').where({ telegram_id: WINNER_TG }).update({ agent_username: 'agent1' });
    const winner = await db('users').where({ telegram_id: WINNER_TG }).first();
    await processRoomPayout(db, roomId, winner.id);
    const winnerAfter = await db('users').where({ telegram_id: WINNER_TG }).first();
    expect(Number(winnerAfter.demo_wallet_balance)).toBe(100 + 50);
    const agent = await db('agents').where({ telegram_username: 'agent1' }).first();
    expect(Number(agent.demo_commission_balance)).toBe(1);
    const demoWinningLedger = await db('financial_ledger').where({ type: 'DEMO_WINNING_PAYOUT', is_demo: true });
    expect(demoWinningLedger.length).toBe(1);
    await expect(processRoomPayout(db, roomId, winner.id)).rejects.toThrow();
    const demoWinningLedgerAfter = await db('financial_ledger').where({ type: 'DEMO_WINNING_PAYOUT', is_demo: true });
    expect(demoWinningLedgerAfter.length).toBe(1);
  });

  it('loads the wallet router without a ReferenceError', () => {
    const walletRouter = require('../src/routes/wallet');
    expect(typeof walletRouter).toBe('function');
  });

  it('blocks wallet deposits in Demo Mode', async () => {
    await login(PLAYER_TG[0]);
    const res = await request(app).post('/api/wallet/deposit').set(devHeader(PLAYER_TG[0])).send({ amount: 10 });
    expect(res.status).toBe(403);
  });

  it('hides real room details across modes', async () => {
    const realRoomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: realRoomId, level: 1, entry_fee: 10, status: 'WAITING', is_demo: false });
    const res = await request(app).get(`/api/rooms/${realRoomId}`).set(devHeader(PLAYER_TG[0]));
    expect(res.status).toBe(404);
  });

  it('hides real wallet balance in auth responses', async () => {
    await login(PLAYER_TG[0]);
    await db('users').where({ telegram_id: PLAYER_TG[0] }).update({ wallet_balance: 999, demo_wallet_balance: 42 });
    const me = await request(app).get('/api/auth/me').set(devHeader(PLAYER_TG[0]));
    expect(me.status).toBe(200);
    expect(Number(me.body.user.wallet_balance)).toBe(42);
  });
});
