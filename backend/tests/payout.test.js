const crypto = require('crypto');
const { processRoomPayout } = require('../src/services/payoutService');
const { cleanDb, db } = require('./helpers');

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {

});

describe('Payout calculations', () => {
  it('calculates six-player payout values', () => {
    const entryFee = 10;
    const totalPool = 6 * entryFee;
    const winnerPayout = 5 * entryFee;
    const platformCommission = 1 * entryFee;
    expect(totalPool).toBe(60);
    expect(winnerPayout).toBe(50);
    expect(platformCommission).toBe(10);
  });

  it('processes atomic payout transaction', async () => {
    const user = await db('users').insert({ telegram_id: 1001, first_name: 'Winner', wallet_balance: 0 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING' });
    for (let i = 0; i < 6; i++) {
      const p = await db('users').insert({ telegram_id: 2000 + i, first_name: 'P'+i, wallet_balance: 0 }).returning('*').then(r=>r[0]);
      await db('room_participants').insert({ room_id: roomId, user_id: p.id, card: JSON.stringify([]) });
    }
    const result = await processRoomPayout(db, roomId, user.id);
    expect(result.totalPool).toBe(60);
    expect(result.platformCommission).toBe(10);
    expect(result.agentCommission).toBe(0);
    expect(result.winnerPayout).toBe(50);

    const updated = await db('users').where({ id: user.id }).first();
    expect(Number(updated.wallet_balance)).toBe(50);
    const ledger = await db('financial_ledger').where({ user_id: user.id, type: 'WINNING_PAYOUT' }).first();
    expect(ledger).toBeTruthy();
    const room = await db('game_rooms').where({ id: roomId }).first();
    expect(room.status).toBe('FINISHED');
  });

  it('prevents duplicate settlement', async () => {
    const user = await db('users').insert({ telegram_id: 1002, first_name: 'Winner2', wallet_balance: 0 }).returning('*').then(r=>r[0]);
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING' });
    for (let i = 0; i < 6; i++) {
      const p = await db('users').insert({ telegram_id: 3000 + i, first_name: 'Q'+i, wallet_balance: 0 }).returning('*').then(r=>r[0]);
      await db('room_participants').insert({ room_id: roomId, user_id: p.id, card: JSON.stringify([]) });
    }
    await processRoomPayout(db, roomId, user.id);
    await expect(processRoomPayout(db, roomId, user.id)).rejects.toThrow();
  });
});
