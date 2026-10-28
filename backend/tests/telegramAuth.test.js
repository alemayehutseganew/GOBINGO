const crypto = require('crypto');

const BOT_TOKEN = '123456:TEST-TOKEN-FOR-UNIT-TESTS';
const FIXED_TOKEN = BOT_TOKEN;

const { validateTelegramInitData, telegramAuthMiddleware } = require('../src/middleware/telegramAuth');

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

  if (overrides.tamperHash) params.set('hash', '0'.repeat(64));
  if (overrides.shortHash) params.set('hash', 'a'.repeat(63));
  if (overrides.tamperUser) {
    params.set('user', JSON.stringify({ id: 999, first_name: 'Tampered' }));
  }

  return params.toString();
}

module.exports = { buildInitData, referenceValidate, BOT_TOKEN, FIXED_TOKEN };
