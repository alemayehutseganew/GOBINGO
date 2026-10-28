const request = require('supertest');
const app = require('../src/app');
const { cleanDb } = require('./helpers');

const devUser = JSON.stringify({ id: 999001, first_name: 'Dev', username: 'devuser' });

beforeEach(async () => {
  await cleanDb();
});



describe('Auth routes', () => {
  it('logs in dev user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-dev-user', devUser)
      .send({});
    expect(res.status).toBe(200);
    expect(Number(res.body.user.telegram_id)).toBe(999001);
  });

  it('gets current user', async () => {
    await request(app).post('/api/auth/login').set('x-dev-user', devUser).send({});
    const res = await request(app).get('/api/auth/me').set('x-dev-user', devUser);
    expect(res.status).toBe(200);
    expect(Number(res.body.user.telegram_id)).toBe(999001);
  });
});
