const crypto = require('crypto');
const { processRoomPayout } = require('../src/services/payoutService');
const { cleanDb, db } = require('./helpers');

beforeEach(async () => {
  await cleanDb();
});

describe('Financial integrity', () => {
  it('reconciles six-player payout with referral commission', async () => {
    const winner = await db('users').insert({ telegram_id: 5001, first_name: 'Winner', wallet_balance: 0, agent_username: 'agent1' }).returning('*').then(r => r[0]);
    await db('agents').insert({ user_id: winner.id, telegram_username: 'agent1', commission_balance: 0 });
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING' });
    for (let i = 0; i < 6; i++) {
      const p = await db('users').insert({ telegram_id: 6000 + i, first_name: 'P' + i, wallet_balance: 0 }).returning('*').then(r => r[0]);
      await db('room_participants').insert({ room_id: roomId, user_id: p.id, card: JSON.stringify([]) });
    }

    const result = await processRoomPayout(db, roomId, winner.id);
    expect(result.totalPool).toBe(60);
    expect(result.winnerPayout).toBe(50);
    expect(result.platformGrossCommission).toBe(10);
    expect(result.referralCommission).toBe(1); // 10% of 10
    expect(result.platformCommission).toBe(9);

    const winnerAfter = await db('users').where({ id: winner.id }).first();
    expect(Number(winnerAfter.wallet_balance)).toBe(50);
    const agent = await db('agents').where({ telegram_username: 'agent1' }).first();
    expect(Number(agent.commission_balance)).toBe(1);
    const room = await db('game_rooms').where({ id: roomId }).first();
    expect(room.status).toBe('FINISHED');
    expect(Number(room.total_pool)).toBe(60);
  });

  it('prevents duplicate settlement and duplicate referral', async () => {
    const winner = await db('users').insert({ telegram_id: 5002, first_name: 'Winner2', wallet_balance: 0, agent_username: 'agent2' }).returning('*').then(r => r[0]);
    await db('agents').insert({ user_id: winner.id, telegram_username: 'agent2', commission_balance: 0 });
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'RUNNING' });
    for (let i = 0; i < 6; i++) {
      const p = await db('users').insert({ telegram_id: 7000 + i, first_name: 'Q' + i, wallet_balance: 0 }).returning('*').then(r => r[0]);
      await db('room_participants').insert({ room_id: roomId, user_id: p.id, card: JSON.stringify([]) });
    }
    await processRoomPayout(db, roomId, winner.id);
    await expect(processRoomPayout(db, roomId, winner.id)).rejects.toThrow();
    const commissions = await db('financial_ledger').where({ reference_id: `AGENT_REF_${winner.id}_ROOM_${roomId}` });
    expect(commissions.length).toBe(1);
  });

  it('rolls back payout on failure', async () => {
    const winner = await db('users').insert({ telegram_id: 5003, first_name: 'Winner3', wallet_balance: 0 }).returning('*').then(r => r[0]);
    const roomId = crypto.randomUUID();
    await db('game_rooms').insert({ id: roomId, level: 1, entry_fee: 10, status: 'WAITING' }); // not running -> should fail
    for (let i = 0; i < 6; i++) {
      const p = await db('users').insert({ telegram_id: 8000 + i, first_name: 'R' + i, wallet_balance: 0 }).returning('*').then(r => r[0]);
      await db('room_participants').insert({ room_id: roomId, user_id: p.id, card: JSON.stringify([]) });
    }
    await expect(processRoomPayout(db, roomId, winner.id)).rejects.toThrow();
    const room = await db('game_rooms').where({ id: roomId }).first();
    expect(room.status).toBe('WAITING');
    const ledger = await db('financial_ledger').where({ user_id: winner.id, type: 'WINNING_PAYOUT' });
    expect(ledger.length).toBe(0);
  });
});
