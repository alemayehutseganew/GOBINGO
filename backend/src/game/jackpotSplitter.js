function calculatePayout(totalPrizePool, platformFeePercentage, winnerCount) {
  if (winnerCount <= 0) throw new Error("Winner count must be at least 1");

  // Assuming platformFeePercentage is like 10 for 10%
  const platformCut = (totalPrizePool * (platformFeePercentage / 100));
  const netWinnerPool = totalPrizePool - platformCut;

  // Calculate individual payout (floored to 2 decimal places)
  const payoutPerWinner = Math.floor((netWinnerPool / winnerCount) * 100) / 100;

  // Handle any remainder cents by just adding it to the platform cut
  const totalPaidToWinners = payoutPerWinner * winnerCount;
  const remainder = netWinnerPool - totalPaidToWinners;

  return {
    totalPrizePool,
    platformCut: platformCut + remainder,
    netWinnerPool,
    payoutPerWinner
  };
}

module.exports = { calculatePayout };
