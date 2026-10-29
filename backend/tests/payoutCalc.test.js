'use strict';

const { calculatePayout, MIN_PLAYERS } = require('../src/services/payoutCalc');

describe('payoutCalc', () => {
  it('calculates payouts for 2 players', () => {
    const payout = calculatePayout(2, 1000);
    expect(payout.totalPoolCents).toBe(2000);
    expect(payout.platformGrossCents).toBe(333);
    expect(payout.winnerPrizeCents).toBe(1667);
  });

  it('calculates payouts for 3 players', () => {
    const payout = calculatePayout(3, 1000);
    expect(payout.totalPoolCents).toBe(3000);
    expect(payout.platformGrossCents).toBe(500);
    expect(payout.winnerPrizeCents).toBe(2500);
  });

  it('calculates payouts for 6 players', () => {
    const payout = calculatePayout(6, 1000);
    expect(payout.totalPoolCents).toBe(6000);
    expect(payout.platformGrossCents).toBe(1000);
    expect(payout.winnerPrizeCents).toBe(5000);
  });

  it('calculates payouts for 10 players', () => {
    const payout = calculatePayout(10, 1000);
    expect(payout.totalPoolCents).toBe(10000);
    expect(payout.platformGrossCents).toBe(1667);
    expect(payout.winnerPrizeCents).toBe(8333);
  });

  it('handles the odd-cent case', () => {
    const payout = calculatePayout(2, 1);
    expect(payout.totalPoolCents).toBe(2);
    expect(payout.platformGrossCents).toBe(0);
    expect(payout.winnerPrizeCents).toBe(2);
  });

  it('preserves the winnerPrize + platformGross invariant', () => {
    for (const players of [2, 3, 6, 10]) {
      const payout = calculatePayout(players, 1000);
      expect(payout.winnerPrizeCents + payout.platformGrossCents).toBe(payout.totalPoolCents);
    }
  });

  it('rejects participant counts below MIN_PLAYERS', () => {
    expect(() => calculatePayout(MIN_PLAYERS - 1, 1000)).toThrow();
  });
});