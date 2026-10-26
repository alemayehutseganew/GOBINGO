const { startHandler, helpHandler, WELCOME_MESSAGE, HELP_MESSAGE } = require('../src/bot/handlers');

describe('Telegram bot command handlers', () => {
  it('start handler replies with welcome message', async () => {
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { reply };
    await startHandler(ctx);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(WELCOME_MESSAGE);
    expect(reply.mock.calls[0][0]).toContain('GOBINGO');
  });

  it('help handler replies with help message', async () => {
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { reply };
    await helpHandler(ctx);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(HELP_MESSAGE);
    expect(reply.mock.calls[0][0]).toContain('/start');
  });

  it('handlers do not throw when reply resolves', async () => {
    const ctx = { reply: jest.fn().mockResolvedValue(undefined) };
    await expect(startHandler(ctx)).resolves.toBeUndefined();
    await expect(helpHandler(ctx)).resolves.toBeUndefined();
  });
});
const { isBotConfigured, createBot } = require('../src/bot/telegramBot');

describe('Telegram bot configuration', () => {
  it('isBotConfigured returns false for missing/placeholder tokens', () => {
    expect(isBotConfigured('')).toBe(false);
    expect(isBotConfigured(null)).toBe(false);
    expect(isBotConfigured('your-telegram-bot-token')).toBe(false);
    expect(isBotConfigured('short')).toBe(false);
    expect(isBotConfigured('nocolon')).toBe(false);
  });

  it('isBotConfigured returns true for a plausible token', () => {
    expect(isBotConfigured('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11')).toBe(true);
  });

  it('createBot returns null when token missing/placeholder', () => {
    expect(createBot('')).toBeNull();
    expect(createBot('your-telegram-bot-token')).toBeNull();
  });

  it('createBot returns a bot instance for a plausible token when telegraf is available', () => {
    const { loadTelegraf } = require('../src/bot/telegramBot');
    if (!loadTelegraf()) {
      // Telegraf not installed in this environment; skip instance assertion.
      expect(true).toBe(true);
      return;
    }
    const bot = createBot('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
    expect(bot).not.toBeNull();
    expect(typeof bot.handleUpdate).toBe('function');
  });
});