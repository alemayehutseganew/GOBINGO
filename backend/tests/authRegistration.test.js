const request = require('supertest');
const app = require('../src/app');
const { cleanDb, db } = require('./helpers');

const TG = 989001;
const devUser = JSON.stringify({ id: TG, first_name: 'RegUser', username: 'reguser' });
const headers = { 'x-dev-user': devUser, 'Content-Type': 'application/json' };

beforeEach(async () => {
  await cleanDb();
});

describe('Auth registration idempotency', () => {
  it('registers a first-time user', async () => {
    const res = await request(app).post('/api/auth/login').set(headers).send({ agent_username: 'agent1' });
    expect(res.status).toBe(200);
    expect(Number(res.body.user.telegram_id)).toBe(TG);
    expect(res.body.user.agent_username).toBe('agent1');

    const rows = await db('users').where({ telegram_id: TG });
    expect(rows.length).toBe(1);
  });

  it('does not create a duplicate when logging in again', async () => {
    await request(app).post('/api/auth/login').set(headers).send({ agent_username: 'agent1' });

    const before = await db('users').where({ telegram_id: TG }).first();
    await db('users').where({ id: before.id }).update({ wallet_balance: 42.25 });

    const res = await request(app).post('/api/auth/login').set(headers).send({ agent_username: 'agent2' });
    expect(res.status).toBe(200);

    const rows = await db('users').where({ telegram_id: TG });
    expect(rows.length).toBe(1);

    const after = rows[0];
    expect(Number(after.wallet_balance)).toBe(42.25);
    expect(after.agent_username).toBe('agent1');
  });

  it('returns the same user for repeated identical requests', async () => {
    const first = await request(app).post('/api/auth/login').set(headers).send({});
    const second = await request(app).post('/api/auth/login').set(headers).send({});
    const third = await request(app).post('/api/auth/login').set(headers).send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(first.body.user.id).toBe(second.body.user.id);
    expect(second.body.user.id).toBe(third.body.user.id);

    const rows = await db('users').where({ telegram_id: TG });
    expect(rows.length).toBe(1);
  });

  it('handles concurrent login requests without a duplicate-key error', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => request(app).post('/api/auth/login').set(headers).send({}))
    );

    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(Number(res.body.user.telegram_id)).toBe(TG);
    });

    const ids = new Set(results.map((res) => res.body.user.id));
    expect(ids.size).toBe(1);

    const rows = await db('users').where({ telegram_id: TG });
    expect(rows.length).toBe(1);
  });

  it('preserves existing profile, wallet, and agent data', async () => {
    await request(app).post('/api/auth/login').set(headers).send({ agent_username: 'agentX' });
    await db('users').where({ telegram_id: TG }).update({
      wallet_balance: 99.99,
      first_name: 'Original',
    });

    const res = await request(app).post('/api/auth/login').set(headers).send({
      agent_username: 'agentY',
      first_name: 'Changed',
    });
    expect(res.status).toBe(200);

    const user = await db('users').where({ telegram_id: TG }).first();
    expect(Number(user.wallet_balance)).toBe(99.99);
    expect(user.first_name).toBe('Original');
    expect(user.agent_username).toBe('agentX');
  });

  it('rejects unauthenticated registration attempts', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(401);

    const rows = await db('users').where({ telegram_id: TG });
    expect(rows.length).toBe(0);
  });

  it('rejects invalid Telegram user payloads', async () => {
    const badHeaders = { 'x-dev-user': JSON.stringify({ first_name: 'NoId' }), 'Content-Type': 'application/json' };
    const res = await request(app).post('/api/auth/login').set(badHeaders).send({});
    expect(res.status).toBe(401);
  });
});
