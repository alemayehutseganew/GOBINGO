require('dotenv').config();
const { validateEnv } = require('./config/env');
validateEnv();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({
  origin: isProduction
    ? (allowedOrigins.length ? allowedOrigins : false)
    : true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: isProduction ? 300 : 1000, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ ok: true, service: 'GOBINGO' }));
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

// Error handler (no stack traces) - must be registered last
app.use((err, req, res, next) => {
  console.error(err && err.message ? err.message : err);
  res.status(err.status || 500).json({ error: isProduction ? 'Internal server error' : (err.message || 'Internal server error') });
});

module.exports = app;