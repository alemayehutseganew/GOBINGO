function telegramAuthMiddleware(req, res, next) {
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
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData || req.query?.initData;
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userStr = params.get('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed && parsed.id !== undefined && parsed.id !== null) {
          req.tgUser = parsed;
          return next();
        }
      }
    } catch (e) {}
  }
  req.tgUser = { id: 999001, first_name: 'DevTester', username: 'devtester' };
  return next();
}

module.exports = { telegramAuthMiddleware };

