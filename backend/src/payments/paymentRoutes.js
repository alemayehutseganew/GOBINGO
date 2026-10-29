const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const { telegramAuthMiddleware } = require('../middleware/telegramAuth');
const { isDemoMode } = require('../config/env');
const telebirrService = require('./telebirrService');

router.post('/initiate', telegramAuthMiddleware, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const orderId = `ORD-${Date.now()}-${user.id}`;
    await db('deposits').insert({
      user_id: user.id,
      amount,
      status: 'PENDING',
      merchant_order_id: orderId,
    });

    const checkoutUrl = await telebirrService.createCheckoutUrl(amount, orderId);
    return res.json({ checkoutUrl, orderId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Payment initiation failed' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body || {};
    const outTradeNo = payload.outTradeNo || payload.merchantOrderId || payload.orderId;
    const tradeStatus = payload.tradeStatus || payload.status;
    const receiptNumber = payload.receiptNumber || payload.tradeNo || payload.receipt;

    if (telebirrService.telebirrClient && typeof telebirrService.telebirrClient.webhooks?.verify === 'function') {
      const signature = req.headers['x-telebirr-signature'] || req.headers['signature'];
      const valid = telebirrService.telebirrClient.webhooks.verify(payload, signature);
      if (!valid) return res.status(401).send('Invalid signature');
    }

    const isSuccess = String(tradeStatus || '').toUpperCase() === 'SUCCESS' || String(tradeStatus || '').toUpperCase() === 'COMPLETED' || String(tradeStatus || '').toUpperCase() === 'TRADE_SUCCESS';
    if (!isSuccess || !outTradeNo) return res.sendStatus(200);

    const deposit = await db('deposits').where({ merchant_order_id: outTradeNo }).first();
    if (!deposit || deposit.status === 'COMPLETED') return res.sendStatus(200);

    const isDemo = isDemoMode();
    const balanceField = isDemo ? 'demo_wallet_balance' : 'wallet_balance';

    await db.transaction(async (trx) => {
      await trx('deposits').where({ id: deposit.id }).update({
        status: 'COMPLETED',
        telebirr_txn_id: receiptNumber || deposit.telebirr_txn_id,
      });
      await trx('users').where({ id: deposit.user_id }).increment(balanceField, deposit.amount);
      await trx('financial_ledger').insert({
        user_id: deposit.user_id,
        amount: deposit.amount,
        type: isDemo ? 'DEMO_DEPOSIT' : 'DEPOSIT',
        reference_id: `DEPOSIT_${deposit.id}`,
        is_demo: isDemo,
      });
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error(err);
    return res.sendStatus(500);
  }
});

router.post('/verify-receipt', telegramAuthMiddleware, async (req, res) => {
  try {
    const { receiptNumber, amount } = req.body;
    if (!receiptNumber) return res.status(400).json({ success: false, message: 'receiptNumber is required' });

    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await telebirrService.verifyTransaction(receiptNumber);
    if (!result.success) {
      return res.status(400).json({ success: false, message: 'Verification failed' });
    }
    if (amount !== undefined && result.amount !== null && Number(result.amount) < Number(amount)) {
      return res.status(400).json({ success: false, message: 'Amount mismatch' });
    }

    const creditAmount = result.amount || Number(amount) || 0;
    const isDemo = isDemoMode();
    const balanceField = isDemo ? 'demo_wallet_balance' : 'wallet_balance';

    await db.transaction(async (trx) => {
      await trx('users').where({ id: user.id }).increment(balanceField, creditAmount);
      await trx('financial_ledger').insert({
        user_id: user.id,
        amount: creditAmount,
        type: isDemo ? 'DEMO_DEPOSIT' : 'DEPOSIT',
        reference_id: `RECEIPT_${receiptNumber}`,
        is_demo: isDemo,
      });
    });

    const updatedUser = await db('users').where({ id: user.id }).first();
    return res.json({ success: true, newBalance: Number(updatedUser[balanceField]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

module.exports = router;
