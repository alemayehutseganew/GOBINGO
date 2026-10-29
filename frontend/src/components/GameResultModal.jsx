export default function GameResultModal({
  open,
  result,
  currentUserId,
  card,
  markedNumbers = [],
  onPlayAgain,
}) {
  if (!open || !result) return null;

  const winners = Array.isArray(result.winners) ? result.winners : [];
  const isWinner = winners.some((w) => w.userId === currentUserId || w.userId === currentUserId?.id);
  const winnerEntry = winners.find((w) => w.userId === currentUserId || w.userId === currentUserId?.id);
  const amountWon = winnerEntry?.payout ?? result.payout ?? 0;
  const missedAmount = result.payout ?? 0;
  const displayCard = isWinner ? (winnerEntry?.card || card) : card;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`w-full max-w-md rounded-xl p-6 text-center ${isWinner ? 'bg-emerald-700' : 'bg-red-700'}`}>
        <h2 className="mb-2 text-3xl font-bold text-white">
          {isWinner ? 'You Won!' : 'You Lost'}
        </h2>

        {isWinner ? (
          <div className="mb-4 space-y-2 text-white">
            <div className="text-lg font-bold">+{amountWon} Birr</div>
            <div className="text-sm text-slate-100">
              {winners.length > 1 ? `Prize split among ${winners.length} winners` : 'Congratulations!'}
            </div>
          </div>
        ) : (
          <div className="mb-4 space-y-2 text-white">
            <div className="text-sm text-slate-100">
              You missed out on {missedAmount} Birr.
            </div>
          </div>
        )}

        {Array.isArray(displayCard?.numbers || displayCard?.card) && (
          <div className="mx-auto mb-4 max-w-xs">
            <div className="grid grid-cols-5 gap-1">
              {(displayCard.numbers || displayCard.card).flat().map((value, index) => {
                const isFree = index === 12;
                const isMarked = isFree || (Array.isArray(markedNumbers) && markedNumbers.includes(value));
                return (
                  <div
                    key={index}
                    className={`aspect-square flex items-center justify-center rounded text-xs font-bold
                      ${isFree ? 'bg-blue-600 text-white' : isMarked ? 'bg-green-600 text-white' : 'bg-white text-black'}`}
                  >
                    {isFree ? 'F' : value}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={onPlayAgain}
          className="rounded bg-white px-4 py-2 font-bold text-slate-900"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}