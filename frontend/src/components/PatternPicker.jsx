import { useState } from 'react';

const PATTERN_PREVIEWS = {
  ROW_0: [[0,0],[0,1],[0,2],[0,3],[0,4]],
  ROW_1: [[1,0],[1,1],[1,2],[1,3],[1,4]],
  ROW_2: [[2,0],[2,1],[2,2],[2,3],[2,4]],
  ROW_3: [[3,0],[3,1],[3,2],[3,3],[3,4]],
  ROW_4: [[4,0],[4,1],[4,2],[4,3],[4,4]],
  COL_0: [[0,0],[1,0],[2,0],[3,0],[4,0]],
  COL_1: [[0,1],[1,1],[2,1],[3,1],[4,1]],
  COL_2: [[0,2],[1,2],[2,2],[3,2],[4,2]],
  COL_3: [[0,3],[1,3],[2,3],[3,3],[4,3]],
  COL_4: [[0,4],[1,4],[2,4],[3,4],[4,4]],
  DIAG_MAIN: [[0,0],[1,1],[2,2],[3,3],[4,4]],
  DIAG_ANTI: [[0,4],[1,3],[2,2],[3,1],[4,0]],
  FOUR_CORNERS: [[0,0],[0,4],[4,0],[4,4]],
  FULL_HOUSE: [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,1],[1,2],[1,3],[1,4],[2,0],[2,1],[2,2],[2,3],[2,4],[3,0],[3,1],[3,2],[3,3],[3,4],[4,0],[4,1],[4,2],[4,3],[4,4]],
};

function PatternPreview({ pattern }) {
  const cells = PATTERN_PREVIEWS[pattern] || [];
  const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
  return (
    <div className="grid grid-cols-5 gap-px w-12 h-12">
      {Array.from({ length: 25 }, (_, i) => {
        const r = Math.floor(i / 5);
        const c = i % 5;
        const active = cellSet.has(`${r},${c}`);
        return (
          <div
            key={i}
            className={`rounded-sm ${active ? 'bg-amber-400' : 'bg-slate-600'}`}
          />
        );
      })}
    </div>
  );
}

export default function PatternPicker({ availablePatterns, selectedPatterns, onSelectionChange, disabled }) {
  const [local, setLocal] = useState(selectedPatterns || []);

  const toggle = (pattern) => {
    if (disabled) return;
    const next = local.includes(pattern)
      ? local.filter((p) => p !== pattern)
      : [...local, pattern];
    setLocal(next);
    if (onSelectionChange) onSelectionChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-amber-300">Select Patterns</h3>
        <span className="text-xs text-slate-300">{local.length} selected</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(availablePatterns || []).map((pattern) => {
          const selected = local.includes(pattern);
          return (
            <button
              key={pattern}
              type="button"
              disabled={disabled}
              onClick={() => toggle(pattern)}
              aria-pressed={selected}
              className={`flex items-center gap-2 rounded-lg p-2 text-left transition ${
                selected
                  ? 'bg-amber-500/20 border border-amber-500 text-amber-200'
                  : 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <PatternPreview pattern={pattern} />
              <span className="text-xs font-medium">{pattern.replace(/_/g, ' ')}</span>
            </button>
          );
        })}
      </div>
      {local.length === 0 && !disabled && (
        <p className="text-xs text-red-300">Select at least one pattern to play.</p>
      )}
    </div>
  );
}