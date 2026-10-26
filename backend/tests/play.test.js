const { playHandler, getMiniAppUrl, startHandler, helpHandler, balanceHandler } = require('../src/bot/handlers');

describe('Telegram bot /play command', () => {
  it('sends a Web App button for a valid configured URL', async () => {
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { reply };

    await playHandler(ctx, { miniAppUrl: 'https://example.com/app' });

    expect(reply).toHaveBeenCalledTimes(1);
    const [text, extra] = reply.mock.calls[0];
    expect(text).toBeTruthy();
    expect(extra.reply_markup.inline_keyboard[0][0]).toEqual({
      text: 'Play GOBINGO',
      web_app: { url: 'https://example.com/app' },
    });
  });

  it('handles a missing Mini App URL safely', async () => {
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { reply };

    await playHandler(ctx, { miniAppUrl: '' });

    expect(reply).toHaveBeenCalledTimes(1);
    const [text, extra] = reply.mock.calls[0];
    expect(text).toContain('not configured');
    expect(extra).toBeUndefined();
  });

  it('handles an invalid Mini App URL safely', async () => {
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { reply };

    await playHandler(ctx, { miniAppUrl: 'not-a-url' });

    expect(reply).toHaveBeenCalledTimes(1);
    const [text, extra] = reply.mock.calls[0];
    expect(text).toContain('not configured');
    expect(extra).toBeUndefined();
  });

  it('rejects localhost URLs in production', () => {
    expect(getMiniAppUrl('http://localhost:5173', true)).toBeNull();
    expect(getMiniAppUrl('https://127.0.0.1', true)).toBeNull();
  });

  it('preserves existing command handlers', async () => {
    const reply = jest.fn().mockResolvedValue(true);
    await startHandler({ reply });
    await helpHandler({ reply });
    await balanceHandler({ from: { id: 1 }, reply }, { db: jest.fn(() => ({ where: () => ({ first: async () => ({ wallet_balance: 5 }) }) })) });
    expect(reply).toHaveBeenCalled();
  });
});