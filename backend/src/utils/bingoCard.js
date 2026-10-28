// Generates and validates standard 75-ball bingo cards.
//
// Card representation is a 5x5 row-major matrix. Column 0 is B (1-15),
// column 1 is I (16-30), column 2 is N (31-45 with a FREE center),
// column 3 is G (46-60), and column 4 is O (61-75). The FREE center is
// represented by 0, matching the existing frontend and claim validator.

const crypto = require('crypto');

const COLUMN_RANGES = Object.freeze([
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
]);

const NUMBERS_PER_COLUMN = 5;
const NUMBERS_IN_N_COLUMN = 4;

function assertInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer`);
  }
}

function secureShuffle(values) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function rangeValues(min, max) {
  const values = [];
  for (let value = min; value <= max; value += 1) {
    values.push(value);
  }
  return values;
}

function selectColumnNumbers(min, max, count) {
  assertInteger(min, 'column minimum');
  assertInteger(max, 'column maximum');
  assertInteger(count, 'column count');
  if (min > max) throw new RangeError('column minimum must not exceed maximum');
  if (count < 0 || count > max - min + 1) {
    throw new RangeError('invalid column count');
  }
  return secureShuffle(rangeValues(min, max)).slice(0, count).sort((a, b) => a - b);
}

function flatten(card) {
  if (!Array.isArray(card) || card.length !== 5) return [];
  const out = [];
  for (let row = 0; row < 5; row += 1) {
    if (!Array.isArray(card[row]) || card[row].length !== 5) return [];
    for (let col = 0; col < 5; col += 1) {
      out.push(card[row][col]);
    }
  }
  return out;
}

function validateCard(card) {
  if (!Array.isArray(card) || card.length !== 5) {
    return { valid: false, reason: 'card must be a 5x5 matrix' };
  }

  const seen = new Set();
  let numericCount = 0;

  for (let row = 0; row < 5; row += 1) {
    if (!Array.isArray(card[row]) || card[row].length !== 5) {
      return { valid: false, reason: `row ${row} must contain 5 cells` };
    }
    for (let col = 0; col < 5; col += 1) {
      const value = card[row][col];
      const [min, max] = COLUMN_RANGES[col];

      if (row === 2 && col === 2) {
        if (value !== 0) {
          return { valid: false, reason: 'center cell must be FREE (0)' };
        }
        continue;
      }

      if (!Number.isInteger(value)) {
        return { valid: false, reason: `cell (${row}, ${col}) must be an integer` };
      }
      if (value < min || value > max) {
        return { valid: false, reason: `cell (${row}, ${col}) is outside column range ${min}-${max}` };
      }
      if (seen.has(value)) {
        return { valid: false, reason: `duplicate numeric value: ${value}` };
      }
      seen.add(value);
      numericCount += 1;
    }
  }

  if (numericCount !== 24) {
    return { valid: false, reason: `card must contain 24 numeric cells, found ${numericCount}` };
  }
  if (seen.size !== 24) {
    return { valid: false, reason: 'card must contain 24 unique numeric values' };
  }

  return { valid: true, reason: null };
}

function getCardSignature(card) {
  const validation = validateCard(card);
  if (!validation.valid) {
    throw new Error(`Cannot sign invalid card: ${validation.reason}`);
  }
  return JSON.stringify(flatten(card));
}

function areCardsEqual(left, right) {
  try {
    return getCardSignature(left) === getCardSignature(right);
  } catch (e) {
    return false;
  }
}

function findDuplicateCard(card, existingCards = []) {
  if (!Array.isArray(existingCards)) return false;
  try {
    const signature = getCardSignature(card);
    return existingCards.some((existing) => {
      try {
        return getCardSignature(existing) === signature;
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    return false;
  }
}

function generateCard() {
  const columns = [
    selectColumnNumbers(1, 15, NUMBERS_PER_COLUMN),
    selectColumnNumbers(16, 30, NUMBERS_PER_COLUMN),
    selectColumnNumbers(31, 45, NUMBERS_IN_N_COLUMN),
    selectColumnNumbers(46, 60, NUMBERS_PER_COLUMN),
    selectColumnNumbers(61, 75, NUMBERS_PER_COLUMN),
  ];

  const card = [];
  for (let row = 0; row < 5; row += 1) {
    card[row] = [];
    for (let col = 0; col < 5; col += 1) {
      if (row === 2 && col === 2) {
        card[row][col] = 0;
      } else if (col === 2) {
        const nRow = row < 2 ? row : row - 1;
        card[row][col] = columns[col][nRow];
      } else {
        card[row][col] = columns[col][row];
      }
    }
  }

  const validation = validateCard(card);
  if (!validation.valid) {
    throw new Error(`Generated invalid card: ${validation.reason}`);
  }
  return card;
}

module.exports = {
  COLUMN_RANGES,
  generateCard,
  validateCard,
  getCardSignature,
  areCardsEqual,
  findDuplicateCard,
  flatten,
};
