const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.post('/login', (req, res) => {
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

    res.json({
      success: true,
      user: user,
      token: 'mock-jwt-token-' + user.id
    });

  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

