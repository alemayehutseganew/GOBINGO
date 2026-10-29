const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'JWT_SECRET',
  'TELEGRAM_BOT_TOKEN',
];

const PLACEHOLDER_SECRETS = new Set([
  'change-me-in-production',
  'your-telegram-bot-token',
  'secret',
  'password',
]);

function getPaymentProvider() {
  const configured = process.env.PAYMENT_PROVIDER;
  if (configured) return configured.toLowerCase();
  return process.env.NODE_ENV === 'production' ? 'telebirr' : 'mock';
}

function isDemoMode() {
  return String(process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
}

function getMaxSelectablePatterns() {
  const raw = process.env.MAX_SELECTABLE_PATTERNS;
  if (raw === undefined || String(raw).trim() === '') return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return 0;
  return value;
}

function getDemoInitialBalance() {
  const raw = process.env.DEMO_INITIAL_BALANCE;
  if (raw === undefined || String(raw).trim() === '') return 100;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 999999999999.99) {
    throw new Error('DEMO_INITIAL_BALANCE must be a non-negative number no greater than 999999999999.99');
  }
  return value;
}

function validateEnv() {
  const env = process.env.NODE_ENV || 'development';
  const errors = [];

  if (process.env.DEMO_MODE !== undefined && !['true', 'false', ''].includes(String(process.env.DEMO_MODE).trim().toLowerCase())) {
    errors.push('DEMO_MODE must be true or false');
  }

  try {
    getDemoInitialBalance();
  } catch (e) {
    errors.push(e.message);
  }

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (env === 'production') {
    if (!jwtSecret) errors.push('JWT_SECRET is required in production');
    else if (PLACEHOLDER_SECRETS.has(jwtSecret) || jwtSecret.length < 32) {
      errors.push('JWT_SECRET must not use a development placeholder or be shorter than 32 characters in production');
    }
    const telegramToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!telegramToken || telegramToken === 'your-telegram-bot-token') {
      errors.push('TELEGRAM_BOT_TOKEN must be configured in production');
    }
    if (process.env.TELEGRAM_WEBHOOK_URL && !process.env.TELEGRAM_WEBHOOK_SECRET) {
      errors.push('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_WEBHOOK_URL is set');
    }
    const telebirrEnv = process.env.TELEBIRR_ENV || 'sandbox';
    if (!['sandbox', 'production'].includes(telebirrEnv)) {
      errors.push('TELEBIRR_ENV must be sandbox or production');
    }
    if (telebirrEnv === 'production') {
      for (const key of ['TELEBIRR_APP_ID', 'TELEBIRR_APP_KEY', 'TELEBIRR_SHORT_CODE', 'TELEBIRR_NOTIFY_URL']) {
        if (!process.env[key]) errors.push(`${key} is required when TELEBIRR_ENV=production`);
      }
    }
    if (getPaymentProvider() === 'mock') {
      errors.push('PAYMENT_PROVIDER=mock is not allowed in production');
    }
    if (process.env.ALLOW_MOCK_PAYMENTS === 'true') {
      errors.push('ALLOW_MOCK_PAYMENTS must not be enabled in production');
    }
  } else {
    if (!['mock', 'telebirr'].includes(getPaymentProvider())) {
      errors.push('PAYMENT_PROVIDER must be mock or telebirr');
    }
  }

  if (errors.length) {
    const message = `Environment validation failed:\n- ${errors.join('\n- ')}`;
    if (env === 'production') {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
  }
}

module.exports = { validateEnv, getPaymentProvider, isDemoMode, getDemoInitialBalance, getMaxSelectablePatterns };
