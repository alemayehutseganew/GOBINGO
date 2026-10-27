export default function DemoBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-xs font-bold tracking-wide text-amber-300 ${className}`}
      role="status"
      aria-label="Demo mode"
    >
      DEMO — NO REAL MONEY
    </span>
  );
}
