const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { initData } = req.body;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  if (!initData) {
    return res.status(400).json({ error: 'Missing initData' });
  }

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
      .update(BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (hash !== expectedHash) {
      console.error('Hash mismatch. Security check failed.');
      return res.status(401).json({ error: 'Invalid hash' });
    }

    const user = JSON.parse(urlParams.get('user'));

    let dbUser = await db('users').where({ telegram_id: user.id }).first();

    if (!dbUser) {
      const [newUser] = await db('users').insert({
        telegram_id: user.id,
        username: user.username || null,
        first_name: user.first_name || 'Player',
        wallet_balance: 0,
        demo_wallet_balance: 100,
      }).returning('*');
      dbUser = newUser;
      console.log('[auth] Auto-registered new user: ' + dbUser.id + ' (Telegram: ' + dbUser.telegram_id + ')');
    } else {
      console.log('[auth] Found existing user: ' + dbUser.id + ' (Telegram: ' + dbUser.telegram_id + ')');
    }

    res.json({
      success: true,
      user: dbUser,
      token: 'mock-jwt-token-' + dbUser.id
    });

  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

