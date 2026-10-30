const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/knex');

// This is the bulletproof, built-in Telegram validator
function validateTelegramAuth(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (hash !== expectedHash) {
      return { ok: false, error: 'Invalid hash' };
    }

    const userJson = urlParams.get('user');
    return { ok: true, user: JSON.parse(userJson) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

router.post('/login', async (req, res) => {
  try {
    const { initData } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    console.log('[auth] Login attempt received. initData length:', initData ? initData.length : 0);

    if (!initData) {
      return res.status(400).json({ error: 'Missing initData' });
    }

    // Use our custom bulletproof validator
    const validation = validateTelegramAuth(initData, botToken);
    
    if (!validation.ok) {
      console.error('[auth] Validation failed:', validation.error);
      return res.status(401).json({ error: 'Invalid Telegram authentication' });
    }

    const tgUser = validation.user;
    console.log('[auth] Validated user:', tgUser.id);

    let user = await db('users').where({ telegram_id: tgUser.id }).first();

    if (!user) {
      const [newUser] = await db('users').insert({
        telegram_id: tgUser.id,
        username: tgUser.username || null,
        first_name: tgUser.first_name || 'Player',
        wallet_balance: 0,
        demo_wallet_balance: 100, 
      }).returning('*');
      user = newUser;
      console.log(`[auth] Auto-registered new user: ${user.id}`);
    } else {
      console.log(`[auth] Found existing user: ${user.id}`);
    }

    res.json({ success: true, user, token: 'mock-jwt-' + user.id });
  } catch (err) {
    console.error('[auth] FULL LOGIN ERROR:', err);
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

router.get('/me', async (req, res) => {
  res.json({ success: true });
});

module.exports = router;