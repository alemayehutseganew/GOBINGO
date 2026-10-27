'use strict';

const crypto = require('crypto');
const { parseUser } = require('../src/socket/gameHandler');

describe('socket Telegram identity', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalBotToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
  });

  it('rejects a socket without Telegram identity', () => {
    const socket = { handshake: { auth: {} } };
    expect(parseUser(socket)).toBeNull();
  });

  it('rejects a malformed dev user', () => {
    process.env.NODE_ENV = 'development';
    process.env.TELEGRAM_BOT_TOKEN = 'your-telegram-bot-token';
    const socket = { handshake: { auth: { devUser: '{not-json' } } };
    expect(parseUser(socket)).toBeNull();
  });

  it('rejects a dev user without an id', () => {
    process.env.NODE_ENV = 'development';
    process.env.TELEGRAM_BOT_TOKEN = 'your-telegram-bot-token';
    const socket = { handshake: { auth: { devUser: JSON.stringify({ first_name: 'NoId' }) } } };
    expect(parseUser(socket)).toBeNull();
  });

  it('returns a valid dev user', () => {
    process.env.NODE_ENV = 'development';
    process.env.TELEGRAM_BOT_TOKEN = 'your-telegram-bot-token';
    const socket = { handshake: { auth: { devUser: JSON.stringify({ id: 123, first_name: 'Dev' }) } } };
    expect(parseUser(socket)).toEqual({ id: 123, first_name: 'Dev' });
  });

  it('returns the verified Telegram user in production', () => {
    const token = 'test-bot-token';
    const user = { id: 42, first_name: 'Test' };
    const authDate = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams();
    params.set('user', JSON.stringify(user));
    params.set('auth_date', String(authDate));
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    params.set('hash', hash);
    const initData = params.toString();

    process.env.NODE_ENV = 'production';
    process.env.TELEGRAM_BOT_TOKEN = token;
    const socket = { handshake: { auth: { initData } } };
    expect(parseUser(socket)).toEqual(user);
  });

  it('rejects invalid production initData', () => {
    process.env.NODE_ENV = 'production';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    const socket = { handshake: { auth: { initData: 'user=%7B%22id%22%3A1%7D&hash=bad' } } };
    expect(parseUser(socket)).toBeNull();
  });
});