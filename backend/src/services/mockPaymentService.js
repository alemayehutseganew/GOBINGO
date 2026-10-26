const { getPaymentProvider } = require('../config/env');

function isMockProviderEnabled() {
  return getPaymentProvider() === 'mock';
}

function assertMockProviderAllowed() {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production') {
    throw new Error('Mock payments are not allowed in production');
  }
  if (!isMockProviderEnabled()) {
    throw new Error('Mock payment provider is not enabled');
  }
}

const ALLOWED_OUTCOMES = new Set(['success', 'failed', 'cancelled', 'pending']);

async function confirmMockDeposit(dbConn, { outTradeNo, requesterTelegramId, outcome = 'success', amount = null, delayMs = 0 }) {
  assertMockProviderAllowed();
  if (!ALLOWED_OUTCOMES.has(outcome)) throw new Error('Invalid payment outcome');
  if (delayMs && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(Number(delayMs), 5000)));
  }

  const user = await dbConn('users').where({ telegram_id: requesterTelegramId }).first();
  if (!user) throw new Error('User not found');

  const deposit = await dbConn('deposits').where({ merchant_order_id: outTradeNo }).first();
  if (!deposit) throw new Error('Deposit not found');
  if (Number(deposit.user_id) !== Number(user.id)) throw new Error('Forbidden');
  if (amount !== null && Number(amount) !== Number(deposit.amount)) throw new Error('Amount mismatch');

  if (deposit.status === 'COMPLETED') {
    return { status: 'COMPLETED', already: true, deposit };
  }
  if (['FAILED', 'CANCELLED'].includes(deposit.status) && outcome === 'success') {
    throw new Error('Invalid state transition');
  }

  if (outcome === 'pending') {
    return { status: deposit.status, already: false, deposit };
  }

  if (outcome === 'success') {
    await dbConn.transaction(async (trx) => {
      await trx('deposits').where({ id: deposit.id }).update({ status: 'COMPLETED', telebirr_txn_id: outTradeNo, provider: 'mock' });
      await trx('users').where({ id: deposit.user_id }).increment('wallet_balance', deposit.amount);
      await trx('financial_ledger').insert({
        user_id: deposit.user_id,
        amount: deposit.amount,
        type: 'DEPOSIT',
        reference_id: `MOCK_${outTradeNo}`,
        metadata: { provider: 'mock', outcome: 'success' },
      });
    });
    const updated = await dbConn('deposits').where({ id: deposit.id }).first();
    return { status: 'COMPLETED', already: false, deposit: updated };
  }

  const nextStatus = outcome === 'cancelled' ? 'CANCELLED' : 'FAILED';
  await dbConn('deposits').where({ id: deposit.id }).update({ status: nextStatus, telebirr_txn_id: outTradeNo, provider: 'mock' });
  const updated = await dbConn('deposits').where({ id: deposit.id }).first();
  return { status: nextStatus, already: false, deposit: updated };
}

module.exports = {
  isMockProviderEnabled,
  assertMockProviderAllowed,
  confirmMockDeposit,
  ALLOWED_OUTCOMES,
};
