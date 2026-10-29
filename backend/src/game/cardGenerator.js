function getRandomNumbers(min, max, count) {
  const nums = new Set();
  while (nums.size < count) {
    nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  return Array.from(nums); // Return as array, DO NOT sort
}

function generateSingleCard() {
  const card = [];
  const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

  // Generate columns
  const cols = ranges.map((range) => getRandomNumbers(range[0], range[1], 5));

  // Build rows
  for (let i = 0; i < 5; i += 1) {
    const row = [];
    for (let j = 0; j < 5; j += 1) {
      row.push(cols[j][i]);
    }
    card.push(row);
  }

  // Set FREE space
  card[2][2] = 'FREE';

  return card;
}

function generateCardPool(size = 400) {
  const pool = [];
  const uniqueCards = new Set();

  while (pool.length < size) {
    const card = generateSingleCard();
    const cardString = JSON.stringify(card);

    if (!uniqueCards.has(cardString)) {
      uniqueCards.add(cardString);
      pool.push({ id: pool.length + 1, matrix: card }); // ID 1 to 400
    }
  }

  return pool;
}

function validateCard(card) {
  if (!Array.isArray(card) || card.length !== 5) {
    return { valid: false, reason: 'card must be a 5x5 matrix' };
  }
  for (let row = 0; row < 5; row += 1) {
    if (!Array.isArray(card[row]) || card[row].length !== 5) {
      return { valid: false, reason: `row ${row} must contain 5 cells` };
    }
  }
  return { valid: true, reason: null };
}

module.exports = { getRandomNumbers, generateSingleCard, generateCardPool, validateCard };
