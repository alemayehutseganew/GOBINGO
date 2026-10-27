export default function BingoCard({ card, drawn, onCellClick }) {
  const isFree = (val) => val === 0;
  const isDrawn = (val) => !isFree(val) && Array.isArray(drawn) && drawn.includes(val);
  return (
    <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-700 p-2" role="grid" aria-label="Bingo card">
      {card.flat().map((v, i) => {
        const free = isFree(v);
        const drawnCell = isDrawn(v);
        return (
          <button
            key={i}
            onClick={() => onCellClick && onCellClick(v)}
            aria-label={free ? 'Free space' : `Number ${v}${drawnCell ? ', drawn' : ''}`}
            className={`aspect-square flex items-center justify-center rounded text-sm font-bold transition
              ${free ? 'bg-emerald-500 text-slate-900' : drawnCell ? 'bg-amber-500 text-slate-900' : 'bg-slate-600 text-slate-100'}`}
          >
            {free ? 'FREE' : v}
          </button>
        );
      })}
    </div>
  );
}

