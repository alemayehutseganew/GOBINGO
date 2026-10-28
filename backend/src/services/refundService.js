async function processRoomRefund(dbConn, roomId, options = {}) {
  const ownsTransaction = !options.transaction;
  const trx = options.transaction || await dbConn.transaction();
  try {
    const lockedRoom = await trx('game_rooms').where({ id: roomId }).forUpdate().first();
    if (!lockedRoom) throw new Error('Room not found');
    if (lockedRoom.settled_at) throw new Error('Room already settled');
    if (lockedRoom.status !== 'RUNNING') throw new Error('Room is not running');

    if (lockedRoom.winner_id !== null && lockedRoom.winner_id !== undefined) {
      throw new Error('Room already has a winner');
    }
    const winningParticipant = await trx('room_participants')
      .where({ room_id: roomId, is_winner: true })
      .first();
    if (winningParticipant) throw new Error('Room already has a winner');

    const entryFee = Number(lockedRoom.entry_fee);
    if (!Number.isFinite(entryFee) || entryFee <= 0) {
      throw new Error('Invalid entry fee');
    }

    const participants = await trx('room_participants').where({ room_id: roomId }).orderBy('user_id');
    if (participants.length === 0) throw new Error('No participants to refund');

    const isDemo = Boolean(lockedRoom.is_demo);
    const balanceField = isDemo ? 'demo_wallet_balance' : 'wallet_balance';
    const refundType = isDemo ? 'DEMO_ENTRY_REFUND' : 'ENTRY_REFUND';
    const refundReference = `ROOM_REFUND_${roomId}`;

    const existingRefund = await trx('financial_ledger')
      .where({ reference_id: refundReference })
      .first();
    if (existingRefund) throw new Error('Room already refunded');

    for (const participant of participants) {
      await trx('users')
        .where({ id: participant.user_id })
        .increment(balanceField, entryFee);

      await trx('financial_ledger').insert({
        user_id: participant.user_id,
        amount: entryFee,
        type: refundType,
        reference_id: refundReference,
        is_demo: isDemo,
      });
    }

    const updated = await trx('game_rooms')
      .where({ id: roomId })
      .whereNull('settled_at')
      .update({
        status: 'CANCELLED',
        finished_at: new Date(),
        settled_at: new Date(),
        settlement_reference: refundReference,
      });

    if (updated !== 1) throw new Error('Room already settled');

    if (ownsTransaction) await trx.commit();
    return {
      refundedPlayers: participants.length,
      refundedAmount: entryFee * participants.length,
      entryFeeRefunded: entryFee,
    };
  } catch (err) {
    if (ownsTransaction) {
      try { await trx.rollback(); } catch (e) {}
    }
    throw err;
  }
}

module.exports = { processRoomRefund };