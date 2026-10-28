'use strict';

const {
  DRAW_SIZE,
  createDrawPool,
  validateDrawPool,
  nextDrawnNumber,
} = require('../src/utils/drawEngine');

describe('Draw engine', () => {
  it('creates a 75-number pool with every value exactly once', () => {
    const pool = createDrawPool();
    expect(pool).toHaveLength(75);
    expect(validateDrawPool(pool)).toBe(true);
    expect(new Set(pool).size).toBe(75);
    for (let number = 1; number <= 75; number += 1) {
      expect(pool).toContain(number);
    }
  });

  it('rejects malformed pools', () => {
    expect(validateDrawPool([])).toBe(false);
    expect(validateDrawPool(Array.from({ length: 75 }, (_, i) => i + 1).concat([1]))).toBe(false);
    expect(validateDrawPool(Array.from({ length: 75 }, (_, i) => 1))).toBe(false);
  });

  it('returns the next number without mutating the pool', () => {
    const pool = createDrawPool();
    const first = nextDrawnNumber(pool, 0);
    expect(first).toBe(pool[0]);
    expect(pool).toHaveLength(75);
  });

  it('returns null after all 75 numbers have been consumed', () => {
    const pool = createDrawPool();
    expect(nextDrawnNumber(pool, 75)).toBeNull();
  });

  it('rejects invalid draw indices', () => {
    const pool = createDrawPool();
    expect(() => nextDrawnNumber(pool, -1)).toThrow();
    expect(() => nextDrawnNumber(pool, 76)).toThrow();
    expect(() => nextDrawnNumber(pool, 1.5)).toThrow();
  });
});