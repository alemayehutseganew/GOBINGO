const WELCOME_MESSAGE =
  'Welcome to GOBINGO! 🎉\n\n' +
  'Play real-time multiplayer 75-ball bingo with friends.\n' +
  'Use /help to see available commands, or open the Mini App to start playing.';

const HELP_MESSAGE =
  'GOBINGO commands:\n' +
  '/start - Welcome message and quick start\n' +
  '/help - Show this help message\n' +
  '/balance - Check your wallet balance\n' +
  '/play - Open the GOBINGO Mini App and play\n\n' +
  'Open the GOBINGO Mini App from the bot menu to join rooms, manage your wallet, and play.';

const NOT_REGISTERED_MESSAGE =
  'You are not registered yet. Open the GOBINGO Mini App to create your account, then try /balance again.';

const BALANCE_UNAVAILABLE_MESSAGE =
  'Your balance is temporarily unavailable. Please try again later.';

function startHandler(ctx) {
  return ctx.reply(WELCOME_MESSAGE);
}

function helpHandler(ctx) {
  return ctx.reply(HELP_MESSAGE);
}

async function balanceHandler(ctx, deps) {
  const database = (deps && deps.db) || require('../db/knex');
  const telegramId = ctx && ctx.from ? ctx.from.id : undefined;

  if (telegramId === undefined || telegramId === null) {
    return ctx.reply('Unable to identify your Telegram account. Please try again.');
  }

  try {
    const user = await database('users').where({ telegram_id: telegramId }).first();
    if (!user) {
      return ctx.reply(NOT_REGISTERED_MESSAGE);
    }

    const balance = Number(user.wallet_balance);
    if (!Number.isFinite(balance)) {
      return ctx.reply(BALANCE_UNAVAILABLE_MESSAGE);
    }

    return ctx.reply(`Your GOBINGO balance: ${balance.toFixed(2)} ETB`);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('balance handler error:', err && err.message ? err.message : 'unknown');
    }
    return ctx.reply('Unable to fetch your balance right now. Please try again later.');
  }
}

function getMiniAppUrl(raw, isProduction) {
  const prod = isProduction === true || process.env.NODE_ENV === 'production';
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = raw.trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch (e) {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0';
  if (prod) {
    if (parsed.protocol !== 'https:') return null;
    if (isLocal) return null;
  }
  return value;
}

async function playHandler(ctx, deps) {
  const configured =
    deps && Object.prototype.hasOwnProperty.call(deps, 'miniAppUrl')
      ? deps.miniAppUrl
      : process.env.MINI_APP_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const url = getMiniAppUrl(configured, isProduction);

  if (!url) {
    return ctx.reply(
      'The GOBINGO Mini App is not configured yet. Please try again later.'
    );
  }

  return ctx.reply('Tap the button below to open GOBINGO and play.', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Play GOBINGO', web_app: { url } }]],
    },
  });
}
function registerHandlers(bot) {
  if (!bot) return;
  bot.start(startHandler);
  bot.help(helpHandler);
  if (typeof bot.command === 'function') {
    bot.command('balance', balanceHandler);
    bot.command('play', playHandler);
  }
  return bot;
}

module.exports = {
  WELCOME_MESSAGE,
  HELP_MESSAGE,
  NOT_REGISTERED_MESSAGE,
  BALANCE_UNAVAILABLE_MESSAGE,
  startHandler,
  helpHandler,
  balanceHandler,
  balance: balanceHandler,
  balanceCommand: balanceHandler,
  handleBalance: balanceHandler,
  playHandler,
  play: playHandler,
  playCommand: playHandler,
  handlePlay: playHandler,
  getMiniAppUrl,
  registerHandlers,
};