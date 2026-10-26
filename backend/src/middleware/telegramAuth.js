const crypto = require('crypto');

function validateTelegramInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  // auth_date freshness (optional, 24h)
  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  if (authDate && now - authDate > 86400) return null;
  const userStr = params.get('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

function telegramAuthMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData || req.query?.initData;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const isProduction = process.env.NODE_ENV === 'production';
  // Dev bypass is never allowed in production
  if (!isProduction && (!botToken || botToken === 'your-telegram-bot-token')) {
    const devUser = req.headers['x-dev-user'];
    if (devUser) {
      try {
        const parsed = JSON.parse(devUser);
        if (parsed && parsed.id !== undefined && parsed.id !== null) {
          req.tgUser = parsed;
          return next();
        }
      } catch (e) {}
    }
    if (initData) {
      const params = new URLSearchParams(initData);
      const u = params.get('user');
      if (u) {
        try {
          const parsed = JSON.parse(u);
          if (parsed && parsed.id !== undefined && parsed.id !== null) {
            req.tgUser = parsed;
            return next();
          }
        } catch (e) {}
      }
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = validateTelegramInitData(initData, botToken);
  if (!user || user.id === undefined || user.id === null) return res.status(401).json({ error: 'Invalid initData' });
  req.tgUser = user;
  next();
}

module.exports = { validateTelegramInitData, telegramAuthMiddleware };
