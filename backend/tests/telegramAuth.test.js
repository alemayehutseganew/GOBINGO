const crypto = require('crypto');
const request = require('supertest');
const express = require('express');
const { validateTelegramInitData, telegramAuthMiddleware } = require('../src/middleware/telegramAuth');

const BOT_TOKEN = '123456:TEST-TOKEN-FOR-UNIT-TESTS';

function buildInitData(overrides = {}) {
  const token = overrides.token || BOT_TOKEN;
  const user = overrides.user || { id: 42, first_name: 'Test', username: 'testuser' };
  const authDate = overrides.authDate !== undefined ? overrides.authDate : Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate));

  const entries = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);

  if (overrides.tamperHash) params.set('hash', '0'.repeat(64));
  if (overrides.tamperUser) {
    params.set('user', JSON.stringify({ id: 999, first_name: 'Tampered' }));
  }

  return params.toString();
}

describe('Telegram initData validation', () => {
  it('accepts valid initData', () => {
    const initData = buildInitData();
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(true);
    expect(result.user.id).toBe(42);
  });

  it('rejects missing initData', () => {
    const result = validateTelegramInitData('', BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
  });

  it('rejects missing bot token', () => {
    const initData = buildInitData();
    const result = validateTelegramInitData(initData, '');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bot_token_missing');
  });

  it('rejects invalid signature', () => {
    const initData = buildInitData({ tamperHash: true });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature');
  });

  it('rejects tampered user data', () => {
    const initData = buildInitData({ tamperUser: true });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature');
  });

  it('rejects expired initData', () => {
    const initData = buildInitData({ authDate: Math.floor(Date.now() / 1000) - (25 * 60 * 60) });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects malformed initData without hash', () => {
    const params = new URLSearchParams();
    params.set('user', JSON.stringify({ id: 1 }));
    params.set('auth_date', String(Math.floor(Date.now() / 1000)));
    const result = validateTelegramInitData(params.toString(), BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed');
  });
});

describe('Telegram auth middleware', () => {
  let app;
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    app = express();
    app.use(express.json());
    app.post('/protected', telegramAuthMiddleware, (req, res) => {
      res.json({ ok: true, userId: req.tgUser.id });
    });
  });

  it('allows a valid signed request', async () => {
    const initData = buildInitData();
    const res = await request(app)
      .post('/protected')
      .set('x-telegram-init-data', initData);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(42);
  });

  it('returns 401 for an invalid signature', async () => {
    const initData = buildInitData({ tamperHash: true });
    const res = await request(app)
      .post('/protected')
      .set('x-telegram-init-data', initData);
    expect(res.status).toBe(401);
  });

  it('returns 401 when initData is missing', async () => {
    const res = await request(app).post('/protected');
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired initData', async () => {
    const initData = buildInitData({ authDate: Math.floor(Date.now() / 1000) - (25 * 60 * 60) });
    const res = await request(app)
      .post('/protected')
      .set('x-telegram-init-data', initData);
    expect(res.status).toBe(401);
  });
});