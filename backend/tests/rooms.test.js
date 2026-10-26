const request = require('supertest');
const app = require('../src/app');
const { cleanDb, db } = require('./helpers');

const devUser = JSON.stringify({ id: 999001, first_name: 'Dev', username: 'devuser' });
const headers = { 'x-dev-user': devUser, 'Content-Type': 'application/json' };

beforeEach(async () => {
  await cleanDb();
  await request(app).post('/api/auth/login').set('x-dev-user', devUser).send({});
  await db('users').where({ telegram_id: 999001 }).update({ wallet_balance: 100 });
});



describe('Rooms routes', () => {
  it('joins a room and returns a card', async () => {
    const res = await request(app).post('/api/rooms/join').set(headers).send({ level: 1 });
    expect(res.status).toBe(200);
    expect(res.body.room).toBeTruthy();
    expect(Array.isArray(res.body.card)).toBe(true);
    expect(res.body.card.length).toBe(5);
  });

  it('lists rooms', async () => {
    await request(app).post('/api/rooms/join').set(headers).send({ level: 1 });
    const res = await request(app).get('/api/rooms').set(headers);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rooms)).toBe(true);
  });
});
