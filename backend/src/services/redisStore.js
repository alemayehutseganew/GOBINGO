const Redis = require('ioredis');

let redis = null;
let available = false;
const memory = new Map();

function initRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
    redis.on('error', () => { available = false; });
    redis.connect().then(() => { available = true; console.log('Redis connected'); })
      .catch(() => { available = false; console.warn('Redis unavailable, using in-memory store'); });
  } catch (e) {
    available = false;
  }
}
initRedis();

async function get(key) {
  if (available && redis) {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  }
  return memory.has(key) ? memory.get(key) : null;
}

async function set(key, value, ttlSeconds) {
  if (available && redis) {
    const str = JSON.stringify(value);
    if (ttlSeconds) await redis.set(key, str, 'EX', ttlSeconds);
    else await redis.set(key, str);
    return;
  }
  memory.set(key, value);
  if (ttlSeconds) setTimeout(() => memory.delete(key), ttlSeconds * 1000);
}

async function del(key) {
  if (available && redis) { await redis.del(key); return; }
  memory.delete(key);
}

async function incr(key) {
  if (available && redis) return redis.incr(key);
  const v = (memory.get(key) || 0) + 1;
  memory.set(key, v);
  return v;
}

async function sadd(key, member) {
  if (available && redis) return redis.sadd(key, member);
  const s = memory.get(key) || new Set();
  s.add(member);
  memory.set(key, s);
  return s.size;
}

async function smembers(key) {
  if (available && redis) return redis.smembers(key);
  const s = memory.get(key);
  return s ? Array.from(s) : [];
}

async function srem(key, member) {
  if (available && redis) return redis.srem(key, member);
  const s = memory.get(key);
  if (s) s.delete(member);
}

module.exports = { get, set, del, incr, sadd, smembers, srem, isAvailable: () => available };
