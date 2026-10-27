export default function DemoBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
    >
      <span className="font-bold">DEMO MODE:</span> Virtual ETB only. No real deposits or cash withdrawals.
    </div>
  );
}
