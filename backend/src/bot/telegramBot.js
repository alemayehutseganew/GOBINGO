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
  const bot = new mod.Telegraf(t);
  try {
    const { registerHandlers } = require('./handlers');
    registerHandlers(bot);
  } catch (e) {}
  return bot;
}

async function launchBot(bot) {
  if (!bot) return false;
  const isProd = process.env.NODE_ENV === 'production';
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (isProd && webhookUrl) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    await bot.telegram.setWebhook(webhookUrl, secret ? { secret_token: secret } : undefined);
    return true;
  }
  await bot.launch();
  return true;
}

function stopBot(bot) {
  if (bot) {
    try { bot.stop('shutdown'); } catch (e) {}
  }
}

module.exports = { isBotConfigured, createBot, launchBot, stopBot, loadTelegraf };