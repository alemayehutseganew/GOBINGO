const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

async function setupSocketRedis(io) {
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[REDIS] REDIS_URL is not set; using in-memory Socket.IO adapter. Game state is not shared across instances and is lost on restart.');
    } else {
      console.log('[REDIS] Running with fallback in-memory socket adapter.');
    }
    return;
  }

  const pubClient = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: 5000, reconnectStrategy: () => false },
  });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  console.log('[REDIS] Socket.IO Redis Adapter connected successfully.');
  return { pubClient, subClient };
}

module.exports = { setupSocketRedis };
