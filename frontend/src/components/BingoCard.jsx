export default function BingoCard({ card, drawn, onCellClick }) {
  const isDaubed = (val) => val === 0 || drawn.includes(val);
  return (
    <div className="grid grid-cols-5 gap-1 bg-slate-700 p-2 rounded-lg">
      {card.flat().map((v, i) => {
        const daubed = isDaubed(v);
        return (
          <button
            key={i}
            onClick={() => onCellClick && onCellClick(v)}
            className={`aspect-square flex items-center justify-center rounded text-sm font-bold transition
              ${daubed ? 'bg-amber-500 text-slate-900' : 'bg-slate-600 text-slate-100'}
              ${v === 0 ? 'bg-emerald-500' : ''}`}
          >
            {v === 0 ? 'FREE' : v}
          </button>
        );
      })}
    </div>
  );
}

