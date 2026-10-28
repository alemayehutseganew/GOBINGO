const crypto = require('crypto');
const request = require('supertest');
const express = require('express');
const { validateTelegramInitData, telegramAuthMiddleware } = require('../src/middleware/telegramAuth');

const BOT_TOKEN = '123456:TEST-TOKEN-FOR-UNIT-TESTS';
const FIXED_TOKEN = '123456789:TEST_TOKEN_WITH_WHITESPACE   ';
// Independent reference implementation derived from the Telegram spec.
function referenceValidate(initData, botToken) {
  const token = String(botToken || '').trim();
  if (!initData) return { ok: false, reason: 'missing' };
  if (!token) return { ok: false, reason: 'bot_token_missing' };
  let params;
  try { params = new URLSearchParams(initData); } catch (e) { return { ok: false, reason: 'malformed' }; }
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'malformed' };
  params.delete('hash');
  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hash.length !== computedHash.length) return { ok: false, reason: 'signature' };
  let valid = false;
  try { valid = crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(hash, 'hex')); } catch (e) { valid = false; }
  if (!valid) return { ok: false, reason: 'signature' };
  const authDate = Number(params.get('auth_date') || 0);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  const now = Math.floor(Date.now() / 1000);
  if (authDate - now > 60) return { ok: false, reason: 'expired' };
  if (now - authDate > 24 * 60 * 60) return { ok: false, reason: 'expired' };
  const userStr = params.get('user');
  if (!userStr) return { ok: false, reason: 'malformed' };
  let user;
  try { user = JSON.parse(userStr); } catch (e) { return { ok: false, reason: 'malformed' }; }
  if (!user || user.id === undefined || user.id === null) return { ok: false, reason: 'malformed' };
  return { ok: true, reason: null, user };
}



function buildInitData(overrides = {}) {
  const token = overrides.token || BOT_TOKEN;
  const user = overrides.user || { id: 42, first_name: 'Test', username: 'testuser' };
  const authDate = overrides.authDate !== undefined ? overrides.authDate : Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate));
  if (overrides.queryId) params.set('query_id', overrides.queryId);
  if (overrides.signature) params.set('signature', overrides.signature);
  if (overrides.extraKeys) {
    for (const [k, v] of Object.entries(overrides.extraKeys)) params.set(k, v);
  }

  const entries = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);

  // Allow tampering for negative tests.
  if (overrides.tamperHash) params.set('hash', '0'.repeat(64));
  if (overrides.shortHash) params.set('hash', 'a'.repeat(63));
  if (overrides.tamperUser) {
    params.set('user', JSON.stringify({ id: 999, first_name: 'Tampered' }));
  }

  return params.toString();
}

describe('Telegram initData validation', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  });

  it('accepts valid signed initData', () => {
    const initData = buildInitData();
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(true);
    expect(result.user.id).toBe(42);
  });

  it('rejects an invalid signature', () => {
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

  it('rejects missing initData', () => {
    const result = validateTelegramInitData('', BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
  });

  it('rejects expired initData', () => {
    const initData = buildInitData({ authDate: Math.floor(Date.now() / 1000) - (25 * 60 * 60) });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects malformed initData without hash', () => {
    const result = validateTelegramInitData('user=%7B%22id%22%3A1%7D&auth_date=1', BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed');
  });
});

describe('Telegram initData validation (additional spec cases)', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  });

  it('matches the independent reference implementation', () => {
    const initData = buildInitData({ extraKeys: { foo: 'bar', Zed: 'last', _underscore: 'first' } });
    const actual = validateTelegramInitData(initData, BOT_TOKEN);
    const expected = referenceValidate(initData, BOT_TOKEN);
    expect(actual.ok).toBe(expected.ok);
    expect(actual.reason).toBe(expected.reason);
  });

  it('keeps the signature field in the data-check string', () => {
    const initData = buildInitData({ signature: 'abc123' });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(true);
  });

  it('sorts keys in plain code-point order', () => {
    const initData = buildInitData({ extraKeys: { Zed: 'z', alpha: 'a', _underscore: 'u' } });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(true);
  });

  it('handles URL-encoded values with spaces and unicode', () => {
    const initData = buildInitData({ user: { id: 7, first_name: 'A B \u00e9' } });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(true);
    expect(result.user.first_name).toBe('A B \u00e9');
  });

  it('rejects future auth_date beyond clock skew', () => {
    const initData = buildInitData({ authDate: Math.floor(Date.now() / 1000) + 120 });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects a hash of the wrong length without throwing', () => {
    const initData = buildInitData({ shortHash: true });
    let result;
    expect(() => {
      result = validateTelegramInitData(initData, BOT_TOKEN);
    }).not.toThrow();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature');
  });

  it('accepts a token with surrounding whitespace', () => {
    const initData = buildInitData({ token: FIXED_TOKEN.trim() });
    const result = validateTelegramInitData(initData, `  ${FIXED_TOKEN}  `);
    expect(result.ok).toBe(true);
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
    expect(res.body.error).toBe('Invalid Telegram signature');
  });

  it('returns 401 when initData is missing', async () => {
    const res = await request(app).post('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing Telegram initData');
  });

  it('returns 401 for expired initData', async () => {
    const initData = buildInitData({ authDate: Math.floor(Date.now() / 1000) - (25 * 60 * 60) });
    const res = await request(app)
      .post('/protected')
      .set('x-telegram-init-data', initData);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Expired Telegram initData');
  });
});