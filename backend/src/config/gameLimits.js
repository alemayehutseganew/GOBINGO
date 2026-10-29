const rawRefundGraceMs = Number(process.env.REFUND_GRACE_MS);
const REFUND_GRACE_MS = Number.isFinite(rawRefundGraceMs) && Number.isInteger(rawRefundGraceMs) && rawRefundGraceMs >= 0
  ? rawRefundGraceMs
  : 10000;

const MAX_PLAYERS = Number(process.env.GAME_MAX_PLAYERS || 10);

if (!Number.isInteger(MAX_PLAYERS) || MAX_PLAYERS < 2) {
  throw new Error('GAME_MAX_PLAYERS must be an integer greater than or equal to 2');
}

module.exports = { MAX_PLAYERS, REFUND_GRACE_MS };