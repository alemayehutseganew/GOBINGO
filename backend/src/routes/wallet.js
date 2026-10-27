const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db/knex');
const { telegramAuthMiddleware } = require('../middleware/telegramAuth');
const { isDemoMode } = require('../config/env');

const telebirr = require('../services/telebirrService');
const limiter = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 30, standardHeaders: true, legacyHeaders: false });
router.use(limiter);

router.get('/balance', telegramAuthMiddleware, async (req, res) => {
  try {
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const balanceField = isDemoMode() ? 'demo_wallet_balance' : 'wallet_balance';
    res.json({ balance: Number(user[balanceField]), demo: isDemoMode() });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Initiate deposit via Telebirr
router.post('/deposit', telegramAuthMiddleware, async (req, res) => {
  try {
    if (isDemoMode()) return res.status(403).json({ error: 'Payment operations are disabled in Demo Mode' });

    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const orderId = `GOBINGO_${user.id}_${Date.now()}`;
    const [dep] = await db('deposits').insert({
      user_id: user.id,
      amount,
      status: 'PENDING',
      merchant_order_id: orderId,
    }).returning('*');
    let preOrder = null;
    try {
      preOrder = await telebirr.createOrder({ amount, merchantOrderId: orderId, returnUrl: req.body.return_url });
    } catch (e) {
      if (process.env.NODE_ENV === 'production' && process.env.TELEBIRR_ENV === 'production') {
        return res.status(502).json({ error: 'Telebirr production API failed' });
      }
      preOrder = { mock: true, orderId };
    }
    res.json({ deposit: dep, preOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Deposit init failed' });
  }
});

router.get('/ledger', telegramAuthMiddleware, async (req, res) => {
  try {
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const rows = await db('financial_ledger').where({ user_id: user.id, is_demo: isDemoMode() }).orderBy('created_at', 'desc').limit(50);
    res.json({ ledger: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
