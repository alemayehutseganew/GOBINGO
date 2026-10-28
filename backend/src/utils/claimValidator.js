// Server-side claim validation engine.
// card: 5x5 array (0 = FREE center)
// drawn: Set of drawn numbers
function normalizeCard(card) {
  if (typeof card === 'string') {
    try {
      const parsed = JSON.parse(card);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  return Array.isArray(card) ? card : null;
}

function normalizeDrawnNumbers(drawnNumbers) {
  if (Array.isArray(drawnNumbers)) return drawnNumbers;
  if (typeof drawnNumbers === 'string') {
    try {
      const parsed = JSON.parse(drawnNumbers);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function buildGrid(card, drawnSet) {
  const grid = [];
  for (let r = 0; r < 5; r++) {
    grid[r] = [];
    for (let c = 0; c < 5; c++) {
      const val = card[r]?.[c];
      if (val === 0) grid[r][c] = true;
      else if (typeof val === 'number' && Number.isFinite(val)) grid[r][c] = drawnSet.has(val);
      else grid[r][c] = false;
    }
  }
  return grid;
}

function checkLines(grid) {
  const wins = [];
  for (let r = 0; r < 5; r++) {
    if (grid[r].every(Boolean)) wins.push(`ROW_${r}`);
  }
  for (let c = 0; c < 5; c++) {
    if (grid.every((row) => row[c])) wins.push(`COL_${c}`);
  }
  if ([0,1,2,3,4].every((i) => grid[i][i])) wins.push('DIAG_MAIN');
  if ([0,1,2,3,4].every((i) => grid[i][4 - i])) wins.push('DIAG_ANTI');
  if (grid[0]?.[0] && grid[0]?.[4] && grid[4]?.[0] && grid[4]?.[4]) wins.push('FOUR_CORNERS');
  if (grid.flat().every(Boolean)) wins.push('BLACKOUT');
  return wins;
}

function validateClaim(card, drawnNumbers = []) {
  const normalizedCard = normalizeCard(card);
  if (!Array.isArray(normalizedCard) || normalizedCard.length !== 5) {
    return { valid: false, patterns: [] };
  }

  const normalizedDrawn = normalizeDrawnNumbers(drawnNumbers);
  const drawnSet = new Set(
    normalizedDrawn
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n))
  );

  const grid = buildGrid(normalizedCard, drawnSet);
  const wins = checkLines(grid);
  return { valid: wins.length > 0, patterns: wins };
}

module.exports = { validateClaim, buildGrid, checkLines };
