const path = require('path');
require(path.join(__dirname, '..', 'backend', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '..', 'backend', '.env') });

const knex = require(path.join(__dirname, '..', 'backend', 'node_modules', 'knex'));
const config = require(path.join(__dirname, '..', 'backend', 'knexfile'));
const Redis = require(path.join(__dirname, '..', 'backend', 'node_modules', 'ioredis'));

async function checkDb() {
  const db = knex(config);
  try {
    await db.raw('SELECT 1');
    console.log('[HEALTH] Database: OK');
    return true;
  } catch (e) {
    console.error('[HEALTH] Database: FAIL', e.message);
    return false;
  } finally {
    await db.destroy();
  }
}

const net = require('net');

async function checkRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  const host = parsed.hostname || 'localhost';
  const port = Number(parsed.port || 6379);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      console.log('[HEALTH] Redis:', ok ? 'OK' : 'unavailable (fallback mode)');
      resolve(ok);
    };
    socket.setTimeout(2000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

const http = require('http');

async function checkApi() {
  const url = process.env.HEALTH_URL || 'http://localhost:3001/health';
  const parsed = new URL(url);
  return new Promise((resolve) => {
    const req = http.get({ hostname: parsed.hostname, port: parsed.port || 80, path: parsed.pathname, timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('[HEALTH] API:', json.ok ? 'OK' : 'FAIL', json.service || '');
          resolve(!!json.ok);
        } catch {
          console.error('[HEALTH] API: FAIL invalid JSON');
          resolve(false);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', (e) => { console.error('[HEALTH] API: FAIL', e.message); resolve(false); });
  });
}

(async () => {
  const results = await Promise.all([checkDb(), checkRedis(), checkApi()]);
  const ok = results[0] && results[2];
  console.log(ok ? '[HEALTH] Core checks passed' : '[HEALTH] Core checks failed');
  process.exit(ok ? 0 : 1);
})();
