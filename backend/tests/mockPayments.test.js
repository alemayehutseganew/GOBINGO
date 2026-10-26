const request = require('supertest');
const app = require('../src/app');
const { cleanDb, db } = require('./helpers');
const { assertMockProviderAllowed, isMockProviderEnabled } = require('../src/services/mockPaymentService');

const devUser = JSON.stringify({ id: 999001, first_name: 'Dev', username: 'devuser' });
const headers = { 'x-dev-user': devUser, 'Content-Type': 'application/json' };
const otherUser = JSON.stringify({ id: 999002, first_name: 'Other', username: 'other' });

beforeEach(async () => {
  await cleanDb();
  await request(app).post('/api/auth/login').set('x-dev-user', devUser).send({});
  await request(app).post('/api/auth/login').set('x-dev-user', otherUser).send({});
  await db('users').where({ telegram_id: 999001 }).update({ wallet_balance: 0 });
});

describe('Mock payments', () => {
  it('records failed, cancelled, and pending outcomes without crediting', async () => {
    for (const outcome of ['failed', 'cancelled', 'pending']) {
      const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 5 });
      const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;
      const res = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo, outcome });
      expect(res.status).toBe(200);
      expect(['FAILED', 'CANCELLED', 'PENDING'].includes(res.body.status) || res.body.status === 'PENDING').toBeTruthy();
    }
    const user = await db('users').where({ telegram_id: 999001 }).first();
    expect(Number(user.wallet_balance)).toBe(0);
  });

  it('rejects invalid amount', async () => {
    const res = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects invalid transaction reference', async () => {
    const res = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo: 'NOPE', outcome: 'success' });
    expect(res.status).toBe(404);
  });

  it('rejects unauthorized confirmation by another user', async () => {
    const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 5 });
    const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;
    const otherHeaders = { 'x-dev-user': otherUser, 'Content-Type': 'application/json' };
    const res = await request(app).post('/api/telebirr/mock/confirm').set(otherHeaders).send({ outTradeNo, outcome: 'success' });
    expect(res.status).toBe(403);
  });

  it('rejects mock provider in production', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldProvider = process.env.PAYMENT_PROVIDER;
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_PROVIDER = 'mock';
    expect(() => assertMockProviderAllowed()).toThrow();
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldProvider === undefined) delete process.env.PAYMENT_PROVIDER; else process.env.PAYMENT_PROVIDER = oldProvider;
  });
});

describe('Mock checkout page', () => {
  it('serves checkout HTML with CSP header and no inline event handlers', async () => {
    const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 10 });
    const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;

    const res = await request(app)
      .get('/api/telebirr/mock/checkout')
      .query({ outTradeNo, amount: 10, userId: 999001 })
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("script-src-attr 'none'");
    expect(res.headers['content-security-policy']).toContain("nonce-");
    expect(res.text).not.toContain('onclick=');
    expect(res.text).toContain('data-action="success"');
    expect(res.text).toContain('data-action="failed"');
    expect(res.text).toContain('data-action="cancelled"');
    expect(res.text).toContain('data-action="pending"');
    expect(res.text).toContain('addEventListener');
    expect(res.text).toContain('Simulate Success');
    expect(res.text).toContain('Simulate Failure');
    expect(res.text).toContain('Simulate Cancelled');
    expect(res.text).toContain('Simulate Pending');
    expect(res.text).toContain('Simulate Duplicate Success');
    expect(res.text).toContain('MOCK PAYMENT — NO REAL MONEY');
  });

  it('rejects checkout page in production mode', async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldProvider = process.env.PAYMENT_PROVIDER;
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_PROVIDER = 'mock';
    const res = await request(app).get('/api/telebirr/mock/checkout').query({ outTradeNo: 'TXN_TEST', amount: 10 });
    expect(res.status).toBe(404);
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldProvider === undefined) delete process.env.PAYMENT_PROVIDER; else process.env.PAYMENT_PROVIDER = oldProvider;
  });

  it('includes outTradeNo and amount in checkout page', async () => {
    const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 25 });
    const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;

    const res = await request(app)
      .get('/api/telebirr/mock/checkout')
      .query({ outTradeNo, amount: 25, userId: 999001 })
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.text).toContain(outTradeNo);
    expect(res.text).toContain('25 ETB');
  });
});

