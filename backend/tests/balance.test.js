const { balanceHandler, NOT_REGISTERED_MESSAGE } = require('../src/bot/handlers');

function createMockDb({ user = null, throws = false } = {}) {
  const first = jest.fn(() => {
    if (throws) throw new Error('database failure');
    return Promise.resolve(user);
  });
  const where = jest.fn(() => ({ first }));
  const db = jest.fn(() => ({ where }));
  db.__where = where;
  db.__first = first;
  return db;
}

describe('Telegram bot /balance command', () => {
  it('shows balance for a registered user', async () => {
    const db = createMockDb({ user: { telegram_id: 123, wallet_balance: '42.50' } });
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { from: { id: 123 }, reply };

    await balanceHandler(ctx, { db });

    expect(db).toHaveBeenCalledWith('users');
    expect(db.__where).toHaveBeenCalledWith({ telegram_id: 123 });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('Your GOBINGO balance: 42.50 ETB');
  });

  it('ignores any Telegram ID supplied as a command argument', async () => {
    const db = createMockDb({ user: { telegram_id: 123, wallet_balance: '10.00' } });
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { from: { id: 123 }, message: { text: '/balance 999999' }, reply };

    await balanceHandler(ctx, { db });

    expect(db.__where).toHaveBeenCalledWith({ telegram_id: 123 });
  });

  it('explains registration when user is not found', async () => {
    const db = createMockDb({ user: null });
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { from: { id: 456 }, reply };

    await balanceHandler(ctx, { db });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(NOT_REGISTERED_MESSAGE);
  });

  it('displays a zero balance correctly', async () => {
    const db = createMockDb({ user: { telegram_id: 789, wallet_balance: 0 } });
    const reply = jest.fn().mockResolvedValue(true);
    const ctx = { from: { id: 789 }, reply };

    await balanceHandler(ctx, { db });

    expect(reply).toHaveBeenCalledWith('Your GOBINGO balance: 0.00 ETB');
  });

  it('handles database failures without exposing internals', async () => {
    const db = createMockDb({ throws: true });
    const reply = jest.fn().mockResolvedValue(undefined);
    const ctx = { from: { id: 321 }, reply };
    await expect(balanceHandler(ctx, { db })).resolves.toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('Unable to fetch your balance right now. Please try again later.');
  });
});