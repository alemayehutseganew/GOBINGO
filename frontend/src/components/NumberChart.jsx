export function numberColumn(number) {
  if (number >= 1 && number <= 15) return 'B';
  if (number >= 16 && number <= 30) return 'I';
  if (number >= 31 && number <= 45) return 'N';
  if (number >= 46 && number <= 60) return 'G';
  if (number >= 61 && number <= 75) return 'O';
  return '';
}

export function formatCalled(number) {
  const column = numberColumn(number);
  return column ? `${column}${number}` : String(number);
}

const COLUMNS = [
  { label: 'B', start: 1 },
  { label: 'I', start: 16 },
  { label: 'N', start: 31 },
  { label: 'G', start: 46 },
  { label: 'O', start: 61 },
];

export default function NumberChart({ drawn = [], latest = null }) {
  const called = new Set(Array.isArray(drawn) ? drawn : []);

  return (
    <section className="rounded-lg bg-slate-800 p-2" aria-label="Called number chart">
      <div className="grid grid-cols-5 gap-1">
        {COLUMNS.map((column) => (
          <div key={column.label} className="min-w-0">
            <div className="mb-1 text-center text-xs font-bold text-slate-300">{column.label}</div>
            <div className="grid grid-cols-1 gap-1">
              {Array.from({ length: 15 }, (_, index) => {
                const number = column.start + index;
                const isCalled = called.has(number);
                const isLatest = latest === number;
                return (
                  <div
                    key={number}
                    aria-label={`${numberColumn(number)}${number}${isCalled ? ', called' : ''}`}
                    className={`flex aspect-square items-center justify-center rounded text-[10px] font-semibold transition-colors sm:text-xs ${
                      isLatest
                        ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-200'
                        : isCalled
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {number}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}