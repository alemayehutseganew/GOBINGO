require('dotenv').config();
const { validateEnv } = require('./config/env');
validateEnv();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Allowed browser origins. Production deployments must set CORS_ORIGINS, but the
// known frontend origins below are always permitted so a missing/short Render
// value cannot silently disable all browser access. Development origins remain
// available in every environment. Wildcard origins are never used.
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://gobingo-rho.vercel.app',
  'https://gobingo-j2mzs02l3-alemayehutseganews-projects.vercel.app',
];

function getAllowedOrigins() {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_ALLOWED_ORIGINS])];
}

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin(origin, callback) {
    // Same-origin/server-to-server requests have no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'x-dev-user'],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(helmet());
app.use(cors(corsOptions));
// Ensure preflight requests are answered even when no route-level handler exists.
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: isProduction ? 300 : 1000, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (req, res) => {
  try {
    const db = require('./db/knex');
    await db.raw('SELECT 1');
    res.json({ ok: true, ready: true });
  } catch (e) {
    res.status(503).json({ ok: false, ready: false });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/telebirr', require('./routes/telebirr'));

// Telegram bot webhook endpoint (only registered when a real bot token is configured).
try {
  const { isBotConfigured, createBot } = require('./bot/telegramBot');
  if (isBotConfigured()) {
    const bot = createBot();
    if (bot) {
      app.post('/api/telegram/webhook', (req, res) => {
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
          return res.sendStatus(401);
        }
        bot.handleUpdate(req.body)
          .then(() => res.sendStatus(200))
          .catch(() => res.sendStatus(500));
      });
      app.set('telegramBot', bot);
    }
  }
} catch (e) {
  // Bot module unavailable or token not configured; skip.
}

// Error handler (no stack traces) - must be registered last
app.use((err, req, res, next) => {
  console.error(err && err.message ? err.message : err);
  res.status(err.status || 500).json({ error: isProduction ? 'Internal server error' : (err.message || 'Internal server error') });
});

module.exports = app;