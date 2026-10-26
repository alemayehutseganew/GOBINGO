// Generates a standard 75-ball bingo card: 5x5 grid.
// Columns: B 1-15, I 16-30, N 31-45 (center FREE), G 46-60, O 61-75
function generateCard() {
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  const card = [];
  for (let col = 0; col < 5; col++) {
    const [min, max] = ranges[col];
    const pool = [];
    for (let n = min; n <= max; n++) pool.push(n);
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const colNums = pool.slice(0, 5);
    for (let row = 0; row < 5; row++) {
      if (!card[row]) card[row] = [];
      card[row][col] = colNums[row];
    }
  }
  // FREE center
  card[2][2] = 0; // 0 represents FREE
  return card;
}

function flatten(card) {
  const out = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out.push(card[r][c]);
  return out;
}

module.exports = { generateCard, flatten };
