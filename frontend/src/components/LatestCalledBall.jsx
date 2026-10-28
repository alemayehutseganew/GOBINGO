import { numberColumn, formatCalled } from './NumberChart.jsx';

export default function LatestCalledBall({ number, label = 'Latest call' }) {
  const column = number ? numberColumn(number) : '';

  if (!number) {
    return (
      <div className="flex flex-col items-center justify-center rounded-full border-2 border-dashed border-slate-500 bg-slate-800 px-6 py-5 text-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="mt-1 text-lg font-bold text-slate-300">Waiting</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-full bg-blue-600 px-6 py-5 text-center shadow-lg">
      <span className="text-xs font-semibold uppercase tracking-wide text-blue-100">{label}</span>
      <span className="mt-1 text-3xl font-black text-white sm:text-4xl">{formatCalled(number)}</span>
      {column && <span className="mt-1 text-xs text-blue-100">Column {column}</span>}
    </div>
  );
}