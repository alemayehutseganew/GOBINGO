require('dotenv').config();
const { validateEnv } = require('./config/env');
validateEnv();
const http = require('http');
const { setupSocket } = require('./socket/gameHandler');
const { setupSocketRedis } = require('./sockets/redisAdapter');

const app = require('./app');
const db = require('./db/knex');

const server = http.createServer(app);
const io = setupSocket(server);
app.set('io', io);

const PORT = process.env.PORT || 3000;

let telegramBotInstance = null;
let startInProgress = false;

async function checkDatabaseReadiness() {
  try {
    const hasUsers = await db.schema.hasTable('users');
    if (!hasUsers) {
      console.warn('[DB] Required tables missing: run `npm run migrate` (see deploy build command)');
    }
  } catch (err) {
    console.warn('[DB] Database readiness check failed:', err && err.message ? err.message : 'unknown error');
  }
}

async function start() {
  if (startInProgress) return;
  startInProgress = true;

  // Bind the port first so Render (and local checks) see an open port
  // immediately, regardless of how long Redis/Telegram/DB init takes.
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Listening on ${PORT}`);
  });

  // Non-blocking database readiness check: never awaits startup.
  checkDatabaseReadiness().catch(() => {});

  try {
    await setupSocketRedis(io);
  } catch (e) {
    console.warn('[REDIS] Adapter setup failed, using in-memory:', e.message);
  }

  // Telegram bot: launch without blocking startup. Never auto-launch in tests
  // (index.js is not loaded by the test suite).
  try {
    const { isBotConfigured, createBot, launchBot } = require('./bot/telegramBot');
    if (isBotConfigured()) {
      const bot = createBot();
      if (bot) {
        console.log('[TELEGRAM] Bot launching');
        if (!telegramBotInstance) {
          launchBot(bot, () => {
            telegramBotInstance = bot;
            app.set('telegramBot', bot);
            console.log('[TELEGRAM] Bot launched');
          });
        }
      }
    } else {
      console.log('[TELEGRAM] Bot not configured (TELEGRAM_BOT_TOKEN missing/placeholder); skipping.');
    }
  } catch (e) {
    console.warn('[TELEGRAM] Bot init error:', e && e.message ? e.message : 'unknown error');
  }
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
