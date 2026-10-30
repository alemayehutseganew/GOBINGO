// Server-side claim validation engine.
//
// A card is a 5x5 matrix where 0 represents the FREE center. Marking is derived
// from the authoritative called-number list; client-supplied marked matrices are
// never trusted.

const { validateCard } = require('./cardGenerator');

const ROW_PATTERNS = Object.freeze(['ROW_0', 'ROW_1', 'ROW_2', 'ROW_3', 'ROW_4']);
const COLUMN_PATTERNS = Object.freeze(['COL_0', 'COL_1', 'COL_2', 'COL_3', 'COL_4']);
const DIAGONAL_PATTERNS = Object.freeze(['DIAG_MAIN', 'DIAG_ANTI']);
const SPECIAL_PATTERNS = Object.freeze(['FOUR_CORNERS']);
const ETHIO_BINGO_PATTERNS = Object.freeze({
  ROW_0: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  ROW_1: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]],
  ROW_2: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]],
  ROW_3: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]],
  ROW_4: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]],
  COL_0: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  COL_1: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
  COL_2: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
  COL_3: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]],
  COL_4: [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]],
  DIAG_MAIN: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
  DIAG_ANTI: [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]],
  FOUR_CORNERS: [[0, 0], [0, 4], [4, 0], [4, 4]],
});

const SUPPORTED_PATTERNS = Object.freeze([
  ...ROW_PATTERNS,
  ...COLUMN_PATTERNS,
  ...DIAGONAL_PATTERNS,
  ...SPECIAL_PATTERNS,
]);

const PATTERN_SET = new Set(SUPPORTED_PATTERNS);
const PATTERN_ALIASES = Object.freeze({});

const DEFAULT_ALLOWED_PATTERNS = Object.freeze([
  ...ROW_PATTERNS,
  ...COLUMN_PATTERNS,
  ...DIAGONAL_PATTERNS,
  'FOUR_CORNERS',
]);

function normalizePattern(pattern) {
  if (typeof pattern !== 'string') return null;
  const trimmed = pattern.trim();
  if (!PATTERN_SET.has(trimmed)) return null;
  return PATTERN_ALIASES[trimmed] || trimmed;
}

function isPatternSupported(pattern) {
  return normalizePattern(pattern) !== null;
}

function normalizeDrawnNumbers(drawnNumbers) {
  if (drawnNumbers instanceof Set) return Array.from(drawnNumbers);
  if (Array.isArray(drawnNumbers)) return drawnNumbers.slice();
  if (drawnNumbers === null || drawnNumbers === undefined) return [];
  try {
    return Array.from(drawnNumbers);
  } catch (e) {
    return [];
  }
}

function normalizeAllowedPatterns(allowedPatterns) {
  if (allowedPatterns === undefined || allowedPatterns === null) {
    return [...DEFAULT_ALLOWED_PATTERNS];
  }
  if (!Array.isArray(allowedPatterns)) return [];
  const normalized = [];
  const seen = new Set();
  for (const pattern of allowedPatterns) {
    const canonical = normalizePattern(pattern);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    }
  }
  return normalized;
}

function buildGrid(card, drawnSetOrNumbers) {
  const drawnSet = drawnSetOrNumbers instanceof Set
    ? drawnSetOrNumbers
    : new Set(normalizeDrawnNumbers(drawnSetOrNumbers));
  const grid = [];
  if (!Array.isArray(card) || card.length !== 5) return grid;
  for (let r = 0; r < 5; r += 1) {
    grid[r] = [];
    if (!Array.isArray(card[r]) || card[r].length !== 5) return [];
    for (let c = 0; c < 5; c += 1) {
      const value = card[r][c];
      if (value === 0) grid[r][c] = true; // FREE center
      else grid[r][c] = drawnSet.has(value);
    }
  }
  return grid;
}

function patternCells(pattern) {
  const canonical = normalizePattern(pattern);
  switch (canonical) {
    case 'ROW_0':
    case 'ROW_1':
    case 'ROW_2':
    case 'ROW_3':
    case 'ROW_4': {
      const row = Number(canonical.slice(4));
      return Array.from({ length: 5 }, (_, col) => [row, col]);
    }
    case 'COL_0':
    case 'COL_1':
    case 'COL_2':
    case 'COL_3':
    case 'COL_4': {
      const col = Number(canonical.slice(4));
      return Array.from({ length: 5 }, (_, row) => [row, col]);
    }
    case 'DIAG_MAIN':
      return Array.from({ length: 5 }, (_, i) => [i, i]);
    case 'DIAG_ANTI':
      return Array.from({ length: 5 }, (_, i) => [i, 4 - i]);
    case 'FOUR_CORNERS':
      return [[0, 0], [0, 4], [4, 0], [4, 4]];
    case 'FULL_HOUSE':
      return Array.from({ length: 25 }, (_, index) => [Math.floor(index / 5), index % 5]);
    default:
      return [];
  }
}

function isPatternComplete(grid, pattern) {
  const cells = patternCells(pattern);
  if (cells.length === 0 || !Array.isArray(grid) || grid.length !== 5) return false;
  return cells.every(([row, col]) => Boolean(grid[row] && grid[row][col]));
}

function checkLines(grid) {
  const wins = [];
  for (let row = 0; row < 5; row += 1) {
    if (isPatternComplete(grid, `ROW_${row}`)) wins.push(`ROW_${row}`);
  }
  for (let col = 0; col < 5; col += 1) {
    if (isPatternComplete(grid, `COL_${col}`)) wins.push(`COL_${col}`);
  }
  if (isPatternComplete(grid, 'DIAG_MAIN')) wins.push('DIAG_MAIN');
  if (isPatternComplete(grid, 'DIAG_ANTI')) wins.push('DIAG_ANTI');
  if (isPatternComplete(grid, 'FOUR_CORNERS')) wins.push('FOUR_CORNERS');
  if (isPatternComplete(grid, 'FULL_HOUSE')) {
    wins.push('FULL_HOUSE');
    wins.push('BLACKOUT');
  }
  return wins;
}

function evaluatePatterns(card, drawnNumbers, allowedPatterns) {
  const validation = validateCard(card);
  if (!validation.valid) return [];
  const allowed = normalizeAllowedPatterns(allowedPatterns);
  const grid = buildGrid(card, drawnNumbers);
  const completed = [];
  for (const pattern of allowed) {
    if (isPatternComplete(grid, pattern)) completed.push(pattern);
  }
  return completed;
}

function closingNumberInPattern(card, pattern, latestNumber) {
  const canonical = normalizePattern(pattern);
  if (!canonical || !Number.isInteger(latestNumber)) return false;
  return patternCells(canonical).some(([row, col]) => card[row][col] === latestNumber);
}

function validateClaimLegacy(card, drawnNumbers, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const allowedPatterns = normalizeAllowedPatterns(opts.allowedPatterns);
  const claimedPattern = opts.claimedPattern === undefined ? null : opts.claimedPattern;
  const normalizedClaimed = claimedPattern === null ? null : normalizePattern(claimedPattern);

  const validation = validateCard(card);
  if (!validation.valid) {
    return {
      valid: false,
      reason: 'invalid_card',
      patterns: [],
      claimedPattern: normalizedClaimed,
      closingNumber: null,
    };
  }

  const drawn = normalizeDrawnNumbers(drawnNumbers);
  const latestNumber = opts.latestNumber === undefined
    ? (drawn.length > 0 ? drawn[drawn.length - 1] : null)
    : opts.latestNumber;

  if (drawn.length === 0) {
    return {
      valid: false,
      reason: 'no_numbers_drawn',
      patterns: [],
      claimedPattern: normalizedClaimed,
      closingNumber: latestNumber,
    };
  }

  const completedPatterns = evaluatePatterns(card, drawn, allowedPatterns);

  if (claimedPattern !== null) {
    if (!isPatternSupported(claimedPattern)) {
      return {
        valid: false,
        reason: 'unsupported_pattern',
        patterns: completedPatterns,
        claimedPattern: null,
        closingNumber: latestNumber,
      };
    }
    if (!allowedPatterns.includes(normalizedClaimed)) {
      return {
        valid: false,
        reason: 'pattern_disabled',
        patterns: completedPatterns,
        claimedPattern: normalizedClaimed,
        closingNumber: latestNumber,
      };
    }
    if (!completedPatterns.includes(normalizedClaimed)) {
      return {
        valid: false,
        reason: 'pattern_incomplete',
        patterns: completedPatterns,
        claimedPattern: normalizedClaimed,
        closingNumber: latestNumber,
      };
    }
    if (!Number.isInteger(latestNumber) || !closingNumberInPattern(card, normalizedClaimed, latestNumber)) {
      return {
        valid: false,
        reason: 'closing_number_not_in_pattern',
        patterns: completedPatterns,
        claimedPattern: normalizedClaimed,
        closingNumber: latestNumber,
      };
    }
    return {
      valid: true,
      reason: null,
      patterns: completedPatterns,
      claimedPattern: normalizedClaimed,
      closingNumber: latestNumber,
    };
  }

  return {
    valid: completedPatterns.length > 0,
    reason: completedPatterns.length > 0 ? null : 'no_winning_pattern',
    patterns: completedPatterns,
    claimedPattern: null,
    closingNumber: latestNumber,
  };
}

function validateClaim(playerCard, calledNumbers, claimedPatternOrOptions) {
  // New Ethio Bingo API: validateClaim(playerCard, calledNumbersSet, claimedPattern)
  if (typeof claimedPatternOrOptions === 'string') {
    const calledSet = calledNumbers instanceof Set
      ? calledNumbers
      : new Set(Array.isArray(calledNumbers) ? calledNumbers : []);
    const patternCoords = ETHIO_BINGO_PATTERNS[claimedPatternOrOptions];
    if (!patternCoords) return { valid: false, reason: 'Invalid pattern' };

    for (const [row, col] of patternCoords) {
      const cardNumber = playerCard && playerCard[row] ? playerCard[row][col] : undefined;
      if (cardNumber === 'FREE' || cardNumber === 0 || cardNumber === null) {
        continue;
      }
      if (!calledSet.has(cardNumber)) {
        return { valid: false, reason: `Number ${cardNumber} not called` };
      }
    }

    return { valid: true, pattern: claimedPatternOrOptions };
  }

  // Backward-compatible API: validateClaim(card, drawnNumbers, options)
  return validateClaimLegacy(playerCard, calledNumbers, claimedPatternOrOptions);
}

const DEFAULT_GAME_PATTERNS = Object.freeze(DEFAULT_ALLOWED_PATTERNS.filter((pattern) => pattern !== 'BLACKOUT'));

function isMarked(num, calledNumbersSet) {
  return num === 'FREE' || calledNumbersSet.has(num);
}

function validateBingo(card, calledNumbersSet) {
  let isValid = false;
  let matchedPattern = null;

  for (let r = 0; r < 5; r++) {
    if (card[r].every((num) => isMarked(num, calledNumbersSet))) {
      isValid = true;
      matchedPattern = `ROW_${r}`;
      return { isValid, matchedPattern };
    }
  }

  for (let c = 0; c < 5; c++) {
    let colWin = true;
    for (let r = 0; r < 5; r++) {
      if (!isMarked(card[r][c], calledNumbersSet)) { colWin = false; break; }
    }
    if (colWin) {
      isValid = true;
      matchedPattern = `COL_${c}`;
      return { isValid, matchedPattern };
    }
  }

  const diag1 = [card[0][0], card[1][1], card[2][2], card[3][3], card[4][4]];
  const diag2 = [card[0][4], card[1][3], card[2][2], card[3][1], card[4][0]];

  if (diag1.every((num) => isMarked(num, calledNumbersSet))) {
    return { isValid: true, matchedPattern: 'DIAGONAL_1' };
  }
  if (diag2.every((num) => isMarked(num, calledNumbersSet))) {
    return { isValid: true, matchedPattern: 'DIAGONAL_2' };
  }

  const corners = [card[0][0], card[0][4], card[4][0], card[4][4]];
  if (corners.every((num) => isMarked(num, calledNumbersSet))) {
    return { isValid: true, matchedPattern: 'FOUR_CORNERS' };
  }

  return { isValid: false, matchedPattern: null };
}


module.exports = {
  ROW_PATTERNS,
  COLUMN_PATTERNS,
  DIAGONAL_PATTERNS,
  SPECIAL_PATTERNS,
  SUPPORTED_PATTERNS,
  DEFAULT_ALLOWED_PATTERNS,
  DEFAULT_GAME_PATTERNS,
  PATTERN_ALIASES,
  validateCard,
  buildGrid,
  checkLines,
  patternCells,
  isPatternSupported,
  normalizePattern,
  isPatternComplete,
  evaluatePatterns,
  closingNumberInPattern,
  ETHIO_BINGO_PATTERNS,
  validateClaim,
  validateBingo,
  normalizeAllowedPatterns,
};
