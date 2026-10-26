require('dotenv').config();
const { validateEnv } = require('./config/env');
validateEnv();
const http = require('http');
const { setupSocket } = require('./socket/gameHandler');
const { setupSocketRedis } = require('./sockets/redisAdapter');

const app = require('./app');

const server = http.createServer(app);
const io = setupSocket(server);
app.set('io', io);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await setupSocketRedis(io);
  } catch (e) {
    console.warn('[REDIS] Adapter setup failed, using in-memory:', e.message);
  }
  server.listen(PORT, () => {
    console.log(`GOBINGO backend listening on ${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, server, io, start };
