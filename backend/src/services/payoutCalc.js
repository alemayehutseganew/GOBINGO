const MIN_PLAYERS = 2;
const PLATFORM_GROSS_RATE_DENOMINATOR = 6;
const REFERRAL_COMMISSION_BASIS_POINTS = 1000; // 10.00%

function calculatePayout(participantCount, entryFeeCents) {
  if (!Number.isInteger(participantCount) || participantCount < MIN_PLAYERS) {
    throw new Error('participantCount must be an integer greater than or equal to 2');
  }
  if (!Number.isInteger(entryFeeCents) || entryFeeCents <= 0) {
    throw new Error('entryFeeCents must be a positive integer');
  }

  const totalPoolCents = participantCount * entryFeeCents;
  const platformGrossCents = Math.round(totalPoolCents / PLATFORM_GROSS_RATE_DENOMINATOR);
  const winnerPrizeCents = totalPoolCents - platformGrossCents;
  const referralCommissionCents = Math.round((platformGrossCents * REFERRAL_COMMISSION_BASIS_POINTS) / 10000);
  const platformNetCents = platformGrossCents - referralCommissionCents;

  if (winnerPrizeCents + platformGrossCents !== totalPoolCents) {
    throw new Error('Payout invariant failed');
  }

  return {
    totalPoolCents,
    platformGrossCents,
    winnerPrizeCents,
    referralCommissionCents,
    platformNetCents,
  };
}

module.exports = {
  MIN_PLAYERS,
  PLATFORM_GROSS_RATE_DENOMINATOR,
  REFERRAL_COMMISSION_BASIS_POINTS,
  calculatePayout,
};