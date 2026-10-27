const request = require('supertest');
const app = require('../src/app');

describe('CORS', () => {
  const allowed = 'https://gobingo-rho.vercel.app';
  const preview = 'https://gobingo-j2mzs02l3-alemayehutseganews-projects.vercel.app';
  const devOrigin = 'http://localhost:5173';
  const disallowed = 'https://evil.example';

  it('returns CORS headers for an allowed production origin', async () => {
    const res = await request(app).get('/health').set('Origin', allowed);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(allowed);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('returns CORS headers for the Vercel preview origin', async () => {
    const res = await request(app).get('/health').set('Origin', preview);
    expect(res.headers['access-control-allow-origin']).toBe(preview);
  });

  it('returns CORS headers for a development origin', async () => {
    const res = await request(app).get('/health').set('Origin', devOrigin);
    expect(res.headers['access-control-allow-origin']).toBe(devOrigin);
  });

  it('does not return CORS headers for a disallowed origin', async () => {
    const res = await request(app).get('/health').set('Origin', disallowed);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles an allowed preflight request', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', allowed)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-telegram-init-data');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(allowed);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-headers']).toMatch(/x-telegram-init-data/i);
  });

  it('does not allow a disallowed preflight origin', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', disallowed)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});