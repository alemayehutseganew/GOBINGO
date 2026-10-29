'use strict';

const PLACEHOLDER_TOKEN = 'your-telegram-bot-token';

function loadTelegraf() {
  try {
    return require('telegraf');
  } catch (e) {
    return null;
  }
}

function isBotConfigured(token) {
  const t = token !== undefined ? token : process.env.TELEGRAM_BOT_TOKEN;
  if (!t || typeof t !== 'string') return false;
  if (t === PLACEHOLDER_TOKEN) return false;
  if (!t.includes(':') || t.length < 20) return false;
  return true;
}

function createBot(token) {
  const t = token !== undefined ? token : process.env.TELEGRAM_BOT_TOKEN;
  if (!isBotConfigured(t)) return null;
  const mod = loadTelegraf();
  if (!mod || !mod.Telegraf) return null;
  const https = require('https');
  const agent = new https.Agent({ family: 4 });
  const bot = new mod.Telegraf(t, {
    telegram: { agent },
  });
  try {
    const { registerHandlers } = require('./handlers');
    registerHandlers(bot);
  } catch (e) {}
  bot.catch((err) => {
    console.warn('[TELEGRAM] Bot error:', err && err.message ? err.message : err);
  });
  return bot;
}

async function launchBot(bot, onLaunch) {
  if (!bot) return false;
  const isProd = process.env.NODE_ENV === 'production';
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (isProd && webhookUrl) {
    try {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
      await bot.telegram.setWebhook(webhookUrl, secret ? { secret_token: secret } : undefined);
      if (typeof onLaunch === 'function') onLaunch();
      return true;
    } catch (e) {
      console.warn('[TELEGRAM] Bot launch failed:', e && e.message ? e.message : 'unknown error');
      return false;
    }
  }
  // Telegraf's launch() promise stays pending while polling, so success is
  // reported through its onLaunch callback (fired after getMe()).
  try {
    bot.launch(typeof onLaunch === 'function' ? onLaunch : undefined).catch((e) => {
      console.warn('[TELEGRAM] Bot launch failed:', e && e.message ? e.message : 'unknown error');
    });
    return true;
  } catch (e) {
    console.warn('[TELEGRAM] Bot launch failed:', e && e.message ? e.message : 'unknown error');
    return false;
  }
}

function stopBot(bot) {
  if (bot) {
    try { bot.stop('shutdown'); } catch (e) {}
  }
}

module.exports = { isBotConfigured, createBot, launchBot, stopBot, loadTelegraf };