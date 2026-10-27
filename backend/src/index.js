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

let telegramBotInstance = null;
let startInProgress = false;

async function start() {
  if (startInProgress) return;
  startInProgress = true;
  try {
    await setupSocketRedis(io);
  } catch (e) {
    console.warn('[REDIS] Adapter setup failed, using in-memory:', e.message);
  }

  // Telegram bot: only launch when configured; never auto-launch in tests (index.js not loaded by tests).
  try {
    const { isBotConfigured, createBot, launchBot } = require('./bot/telegramBot');
    if (isBotConfigured()) {
      const bot = createBot();
      if (bot && !telegramBotInstance) {
        try {
          await launchBot(bot);
          telegramBotInstance = bot;
          app.set('telegramBot', bot);
          console.log('[TELEGRAM] Bot launched');
        } catch (e) {
          // Log safely: never include token or full config.
          console.warn('[TELEGRAM] Bot launch failed:', e && e.message ? e.message : 'unknown error');
        }
      }
    } else {
      console.log('[TELEGRAM] Bot not configured (TELEGRAM_BOT_TOKEN missing/placeholder); skipping.');
    }
  } catch (e) {
    console.warn('[TELEGRAM] Bot init error:', e && e.message ? e.message : 'unknown error');
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`GOBINGO backend listening on ${PORT}`);
  });
}

function shutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}`);
  try {
    if (telegramBotInstance) {
      const { stopBot } = require('./bot/telegramBot');
      stopBot(telegramBotInstance);
      telegramBotInstance = null;
    }
  } catch (e) {
    console.warn('[TELEGRAM] Bot stop error:', e && e.message ? e.message : 'unknown error');
  }
  server.close(() => process.exit(0));
  // Force exit if close hangs.
  setTimeout(() => process.exit(0), 5000).unref();
}

if (require.main === module) {
  start();
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { app, server, io, start, shutdown };
