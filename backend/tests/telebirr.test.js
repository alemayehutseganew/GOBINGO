const request = require('supertest');
const app = require('../src/app');
const { cleanDb, db } = require('./helpers');

const devUser = JSON.stringify({ id: 999001, first_name: 'Dev', username: 'devuser' });
const headers = { 'x-dev-user': devUser, 'Content-Type': 'application/json' };

beforeEach(async () => {
  await cleanDb();
  await request(app).post('/api/auth/login').set('x-dev-user', devUser).send({});
});

afterAll(async () => {
});

describe('Telebirr mock routes', () => {
  it('creates a mock deposit and completes it via mock confirm', async () => {
    const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 10, phoneNumber: '0912345678' });
    expect(dep.status).toBe(200);
    const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;
    expect(outTradeNo).toBeTruthy();

    const user = await db('users').where({ telegram_id: 999001 }).first();
    const confirm = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({
      outTradeNo,
      amount: 10,
      outcome: 'success',
    });
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('COMPLETED');

    const updated = await db('users').where({ telegram_id: 999001 }).first();
    expect(Number(updated.wallet_balance)).toBeGreaterThanOrEqual(10);
  });

  it('does not credit twice on duplicate confirmation', async () => {
    const dep = await request(app).post('/api/telebirr/deposit').set(headers).send({ amount: 10 });
    const outTradeNo = dep.body.data ? dep.body.data.outTradeNo : dep.body.outTradeNo;
    await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo, outcome: 'success' });
    const before = await db('users').where({ telegram_id: 999001 }).first();
    const duplicate = await request(app).post('/api/telebirr/mock/confirm').set(headers).send({ outTradeNo, outcome: 'success' });
    const after = await db('users').where({ telegram_id: 999001 }).first();
    expect(duplicate.body.already).toBe(true);
    expect(Number(after.wallet_balance)).toBe(Number(before.wallet_balance));
  });
});
