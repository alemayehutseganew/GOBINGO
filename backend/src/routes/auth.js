const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const { validateTelegramInitData } = require('../middleware/telegramAuth');

router.post('/login', async (req, res) => {
  try {
    const { initData } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Validate Telegram initData
    const validation = validateTelegramInitData(initData, botToken);
    if (!validation || !validation.ok) {
      return res.status(401).json({ error: 'Invalid Telegram authentication' });
    }

    const tgUser = validation.user;

    // Look up the user in the database
    let user = await db('users').where({ telegram_id: tgUser.id }).first();

    // If user doesn't exist, auto-register them
    if (!user) {
      const [newUser] = await db('users').insert({
        telegram_id: tgUser.id,
        username: tgUser.username || null,
        first_name: tgUser.first_name || 'Player',
        wallet_balance: 0,
        demo_wallet_balance: 100, // Give them 100 demo money to start
      }).returning('*');
      user = newUser;
      console.log(`[auth] Auto-registered new user: ${user.id} (Telegram: ${user.telegram_id})`);
    } else {
      console.log(`[auth] Found existing user: ${user.id} (Telegram: ${user.telegram_id})`);
    }

    // Return success
    res.json({ success: true, user, token: 'mock-jwt-' + user.id });
  } catch (err) {
    console.error('[auth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', async (req, res) => {
  // Simple mock endpoint to keep frontend happy
  res.json({ success: true });
});

module.exports = router;