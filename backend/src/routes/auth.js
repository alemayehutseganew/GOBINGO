const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 20, standardHeaders: true, legacyHeaders: false });
router.use(authLimiter);
const { telegramAuthMiddleware } = require('../middleware/telegramAuth');

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

router.post('/login', telegramAuthMiddleware, async (req, res) => {
  try {
    const u = req.tgUser;
    if (!u || u.id === undefined || u.id === null) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const agentUsername = req.body?.agent_username || null;
    const user = await findOrCreateUser(u, agentUsername);
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', telegramAuthMiddleware, async (req, res) => {
  try {
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
