const { validateClaim } = require('../src/utils/claimValidator');

describe('Claim validator', () => {
  const card = [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, 0, 48, 63],
    [4, 19, 33, 49, 64],
    [5, 20, 34, 50, 65],
  ];

  it('detects a completed row', () => {
    const drawn = [1, 16, 31, 46, 61];
    const res = validateClaim(card, drawn);
    expect(res.valid).toBe(true);
    expect(res.patterns).toContain('ROW_0');
  });

  it('detects four corners', () => {
    const drawn = [1, 5, 61, 65];
    const res = validateClaim(card, drawn);
    expect(res.valid).toBe(true);
    expect(res.patterns).toContain('FOUR_CORNERS');
  });

  it('detects blackout', () => {
    const drawn = [1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 31, 32, 33, 34, 46, 47, 48, 49, 50, 61, 62, 63, 64, 65];
    const res = validateClaim(card, drawn);
    expect(res.valid).toBe(true);
    expect(res.patterns).toContain('BLACKOUT');
  });

  it('rejects incomplete card', () => {
    const res = validateClaim(card, [1, 2]);
    expect(res.valid).toBe(false);
  });
});
describe('Claim validator patterns and closing numbers', () => {
  const card = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 0, 14, 15],
    [16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25],
  ];

  it('validates a row claim with the closing number in that row', () => {
    const result = validateClaim(card, [1, 2, 3, 4, 5], {
      claimedPattern: 'ROW_0',
      latestNumber: 5,
      allowedPatterns: ['ROW_0'],
    });
    expect(result.valid).toBe(true);
    expect(result.claimedPattern).toBe('ROW_0');
    expect(result.closingNumber).toBe(5);
  });

  it('rejects a row claim when the closing number is outside the row', () => {
    const result = validateClaim(card, [1, 2, 3, 4, 5, 6], {
      claimedPattern: 'ROW_0',
      latestNumber: 6,
      allowedPatterns: ['ROW_0'],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('closing_number_not_in_pattern');
  });

  it('validates column, diagonal, corner, and full-house claims', () => {
    expect(validateClaim(card, [1, 6, 11, 16, 21], { claimedPattern: 'COL_0', latestNumber: 21, allowedPatterns: ['COL_0'] }).valid).toBe(true);
    expect(validateClaim(card, [1, 7, 0, 19, 25], { claimedPattern: 'DIAG_MAIN', latestNumber: 25, allowedPatterns: ['DIAG_MAIN'] }).valid).toBe(true);
    expect(validateClaim(card, [5, 9, 0, 17, 21], { claimedPattern: 'DIAG_ANTI', latestNumber: 21, allowedPatterns: ['DIAG_ANTI'] }).valid).toBe(true);
    expect(validateClaim(card, [1, 5, 21, 25], { claimedPattern: 'FOUR_CORNERS', latestNumber: 25, allowedPatterns: ['FOUR_CORNERS'] }).valid).toBe(true);

    const allNumbers = Array.from({ length: 25 }, (_, i) => i + 1);
    const fullHouse = validateClaim(card, allNumbers, { claimedPattern: 'FULL_HOUSE', latestNumber: 25, allowedPatterns: ['FULL_HOUSE'] });
    expect(fullHouse.valid).toBe(true);
    expect(fullHouse.patterns).toContain('FULL_HOUSE');
    expect(fullHouse.patterns).toContain('BLACKOUT');
  });

  it('rejects a disabled pattern', () => {
    const result = validateClaim(card, [1, 2, 3, 4, 5], {
      claimedPattern: 'ROW_0',
      latestNumber: 5,
      allowedPatterns: ['COL_0'],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('pattern_disabled');
  });

  it('rejects an unsupported pattern', () => {
    const result = validateClaim(card, [1, 2, 3, 4, 5], {
      claimedPattern: 'NOT_A_PATTERN',
      latestNumber: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unsupported_pattern');
  });

  it('rejects claims when no number has been drawn', () => {
    const result = validateClaim(card, [], {
      claimedPattern: 'ROW_0',
      latestNumber: null,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_numbers_drawn');
  });

  it('rejects invalid cards', () => {
    const invalidCard = card.map((row) => row.slice());
    invalidCard[2][2] = 7;
    const result = validateClaim(invalidCard, [1, 2, 3, 4, 5], {
      claimedPattern: 'ROW_0',
      latestNumber: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_card');
  });

  it('preserves BLACKOUT compatibility', () => {
    const allNumbers = Array.from({ length: 25 }, (_, i) => i + 1);
    const result = validateClaim(card, allNumbers);
    expect(result.valid).toBe(true);
    expect(result.patterns).toContain('BLACKOUT');
    expect(result.patterns).toContain('FULL_HOUSE');
  });

  it('rejects incomplete claims without a claimed pattern', () => {
    const result = validateClaim(card, [1, 2]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_winning_pattern');
  });
});
