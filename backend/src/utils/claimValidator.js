// Server-side claim validation engine.
// card: 5x5 array (0 = FREE center)
// drawn: Set of drawn numbers
function buildGrid(card, drawnSet) {
  const grid = [];
  for (let r = 0; r < 5; r++) {
    grid[r] = [];
    for (let c = 0; c < 5; c++) {
      const val = card[r][c];
      if (val === 0) grid[r][c] = true; // FREE
      else grid[r][c] = drawnSet.has(val);
    }
  }
  return grid;
}

function checkLines(grid) {
  const wins = [];
  // rows
  for (let r = 0; r < 5; r++) {
    if (grid[r].every(Boolean)) wins.push(`ROW_${r}`);
  }
  // cols
  for (let c = 0; c < 5; c++) {
    if (grid.every((row) => row[c])) wins.push(`COL_${c}`);
  }
  // diagonals
  if ([0,1,2,3,4].every((i) => grid[i][i])) wins.push('DIAG_MAIN');
  if ([0,1,2,3,4].every((i) => grid[i][4 - i])) wins.push('DIAG_ANTI');
  // 4 corners
  if (grid[0][0] && grid[0][4] && grid[4][0] && grid[4][4]) wins.push('FOUR_CORNERS');
  // blackout
  if (grid.flat().every(Boolean)) wins.push('BLACKOUT');
  return wins;
}

function validateClaim(card, drawnNumbers) {
  const drawnSet = new Set(drawnNumbers);
  const grid = buildGrid(card, drawnSet);
  const wins = checkLines(grid);
  return { valid: wins.length > 0, patterns: wins };
}

module.exports = { validateClaim, buildGrid, checkLines };
