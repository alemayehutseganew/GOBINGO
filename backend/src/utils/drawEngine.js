// Authoritative draw-pool helpers for 75-ball bingo.
//
// The draw pool is created with Node.js cryptographically secure randomness.
// Callers persist and consume the pool through database transactions; this
// module contains only pure, side-effect-free helpers.

const crypto = require('crypto');

const DRAW_SIZE = 75;

function createDrawPool() {
  const pool = Array.from({ length: DRAW_SIZE }, (_, index) => index + 1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function validateDrawPool(pool) {
  if (!Array.isArray(pool) || pool.length !== DRAW_SIZE) return false;
  const seen = new Set();
  for (const value of pool) {
    if (!Number.isInteger(value) || value < 1 || value > DRAW_SIZE) return false;
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return seen.size === DRAW_SIZE;
}

function nextDrawnNumber(pool, drawIndex) {
  if (!validateDrawPool(pool)) throw new Error('Invalid draw pool');
  if (!Number.isInteger(drawIndex) || drawIndex < 0 || drawIndex > pool.length) {
    throw new Error('Invalid draw index');
  }
  if (drawIndex >= pool.length) return null;
  return pool[drawIndex];
}

module.exports = {
  DRAW_SIZE,
  createDrawPool,
  validateDrawPool,
  nextDrawnNumber,
};
