const db = require('../db/knex');

const EXPECTED_PLAYERS = Number(process.env.GAME_EXPECTED_PLAYERS || 6);
const PRIZE_ENTRY_MULTIPLE = 5;
const PLATFORM_GROSS_ENTRY_MULTIPLE = 1;
const REFERRAL_COMMISSION_BASIS_POINTS = 1000; // 10.00%

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function fromCents(cents) {
  return cents / 100;
}

async function processRoomPayout(dbConn, roomId, winnerUserId) {
  const trx = await dbConn.transaction();
  try {
    const room = await trx('game_rooms').where({ id: roomId }).forUpdate().first();
    if (!room) throw new Error('Room not found');
    if (room.status === 'FINISHED' || room.winner_id) {
      await trx.rollback();
      throw new Error('Room already settled');
    }
    if (room.status !== 'RUNNING') {
      await trx.rollback();
      throw new Error('Room is not running');
    }

    const participants = await trx('room_participants').where({ room_id: roomId });
    if (participants.length !== EXPECTED_PLAYERS) {
      await trx.rollback();
      throw new Error(`Unsupported player count for settlement: ${participants.length}`);
    }

    const entryFeeCents = toCents(room.entry_fee);
    const totalPoolCents = participants.length * entryFeeCents;
    const winnerPrizeCents = PRIZE_ENTRY_MULTIPLE * entryFeeCents;
    const platformGrossCents = PLATFORM_GROSS_ENTRY_MULTIPLE * entryFeeCents;
    const referralCommissionCents = Math.round((platformGrossCents * REFERRAL_COMMISSION_BASIS_POINTS) / 10000);
    const platformNetCents = platformGrossCents - referralCommissionCents;

    const isDemo = Boolean(room.is_demo);
  const balanceField = isDemo ? 'demo_wallet_balance' : 'wallet_balance';
  const commissionField = isDemo ? 'demo_commission_balance' : 'commission_balance';
  const winningType = isDemo ? 'DEMO_WINNING_PAYOUT' : 'WINNING_PAYOUT';
  const commissionType = isDemo ? 'DEMO_AGENT_COMMISSION' : 'AGENT_COMMISSION';

  // Credit winner (demo-aware)
    await trx('users').where({ id: winnerUserId }).increment(balanceField, fromCents(winnerPrizeCents));
    await trx('financial_ledger').insert({
      user_id: winnerUserId,
      amount: fromCents(winnerPrizeCents),
      type: winningType,
      reference_id: `ROOM_${roomId}`,
      is_demo: isDemo,
    });

    // Referral commission, if the winner has an established referrer.
    const winner = await trx('users').where({ id: winnerUserId }).first();
    let referralPaid = false;
    if (winner && winner.agent_username && referralCommissionCents > 0) {
      const agent = await trx('agents').where({ telegram_username: winner.agent_username }).first();
      if (agent) {
        await trx('agents').where({ id: agent.id }).increment(commissionField, fromCents(referralCommissionCents));
        await trx('financial_ledger').insert({
          user_id: agent.user_id,
          amount: fromCents(referralCommissionCents),
          type: commissionType,
          reference_id: `AGENT_REF_${winnerUserId}_ROOM_${roomId}`,
          is_demo: isDemo,
        });
        referralPaid = true;
      }
    }

    // Conditional state transition protects against concurrent settlement.
    const updated = await trx('game_rooms')
      .where({ id: roomId, status: 'RUNNING' })
      .update({
        status: 'FINISHED',
        winner_id: winnerUserId,
        total_pool: fromCents(totalPoolCents),
        finished_at: new Date(),
      });
    if (updated !== 1) {
      await trx.rollback();
      throw new Error('Room already settled');
    }

    await trx.commit();
    return {
      totalPool: fromCents(totalPoolCents),
      winnerPayout: fromCents(winnerPrizeCents),
      platformCommission: fromCents(referralPaid ? platformNetCents : platformGrossCents),
      platformGrossCommission: fromCents(platformGrossCents),
      referralCommission: fromCents(referralPaid ? referralCommissionCents : 0),
      agentCommission: fromCents(referralPaid ? referralCommissionCents : 0),
    };
  } catch (err) {
    try { await trx.rollback(); } catch (e) {}
    throw err;
  }
}

module.exports = { processRoomPayout, EXPECTED_PLAYERS };
