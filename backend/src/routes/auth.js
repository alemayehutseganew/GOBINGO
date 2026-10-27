const express = require('express');
const router = express.Router();
const { telegramAuthMiddleware } = require('../middleware/telegramAuth');
const db = require('../db/knex');
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 20, standardHeaders: true, legacyHeaders: false });
router.use(authLimiter);
const { isDemoMode, getDemoInitialBalance } = require('../config/env');

async function grantInitialDemoCredit(user) {
  if (!isDemoMode() || !user || user.demo_initial_credit_granted) return user;

  const amount = getDemoInitialBalance();
  if (amount <= 0) return user;

  await db.transaction(async (trx) => {
    const updated = await trx('users')
      .where({ id: user.id, demo_initial_credit_granted: false })
      .update({
        demo_wallet_balance: trx.raw('demo_wallet_balance + ?', [amount]),
        demo_initial_credit_granted: true,
      });

    if (updated === 1) {
      await trx('financial_ledger').insert({
        user_id: user.id,
        amount,
        type: 'DEMO_CREDIT_GRANT',
        reference_id: `DEMO_INITIAL_CREDIT_${user.id}`,
        is_demo: true,
        metadata: { source: 'initial_demo_credit' },
      });
    }
  });

  const refreshed = await db('users').where({ id: user.id }).first();
  return refreshed || user;
}

// Atomically find or create a user by Telegram ID. The insert is ignored on a
// unique-constraint conflict, so concurrent logins reuse the existing row instead
// of producing an unhandled duplicate-key error. Existing profile/wallet data is
// never overwritten by a later login.
async function findOrCreateUser(tgUser, agentUsername) {
  const telegramId = tgUser.id;

  await db('users')
    .insert({
      telegram_id: telegramId,
      telegram_username: tgUser.username || null,
      first_name: tgUser.first_name || null,
      last_name: tgUser.last_name || null,
      agent_username: agentUsername || null,
    })
    .onConflict('telegram_id')
    .ignore();

  const user = await db('users').where({ telegram_id: telegramId }).first();
  if (!user) throw new Error('User could not be loaded');

  // Only fill an agent reference when the existing user does not already have one.
  if (agentUsername && !user.agent_username) {
    await db('users')
      .where({ id: user.id, agent_username: null })
      .update({ agent_username: agentUsername });
    const refreshed = await db('users').where({ id: user.id }).first();
    if (refreshed) user.agent_username = refreshed.agent_username;
  }

  return user;
}

async function sanitizeUserForResponse(user) {
  if (!user) return user;
  const { demo_wallet_balance, demo_initial_credit_granted, ...safeUser } = user;
  if (!isDemoMode()) return safeUser;
  return { ...safeUser, wallet_balance: Number(user.demo_wallet_balance || 0) };
}

router.post('/login', telegramAuthMiddleware, async (req, res) => {
  try {
    const u = req.tgUser;
    if (!u || u.id === undefined || u.id === null) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const agentUsername = req.body?.agent_username || null;
    const user = await findOrCreateUser(u, agentUsername);
    const grantedUser = await grantInitialDemoCredit(user);
    res.json({ user: await sanitizeUserForResponse(grantedUser) });
  } catch (err) {
    console.error('[AUTH] login failed:', err && err.message ? err.message : 'unknown error', err && err.code ? `code=${err.code}` : '');
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', telegramAuthMiddleware, async (req, res) => {
  try {
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: await sanitizeUserForResponse(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
