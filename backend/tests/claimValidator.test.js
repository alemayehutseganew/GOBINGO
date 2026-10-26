const { validateClaim } = require('../src/utils/claimValidator');

describe('Claim validator', () => {
  const card = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 0, 14, 15],
    [16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25],
  ];

  it('detects a completed row', () => {
    const drawn = [1, 2, 3, 4, 5];
    const res = validateClaim(card, drawn);
    expect(res.valid).toBe(true);
    expect(res.patterns).toContain('ROW_0');
  });

  it('detects four corners', () => {
    const drawn = [1, 5, 21, 25];
    const res = validateClaim(card, drawn);
    expect(res.valid).toBe(true);
    expect(res.patterns).toContain('FOUR_CORNERS');
  });

  it('detects blackout', () => {
    const drawn = Array.from({ length: 25 }, (_, i) => i + 1);
    const res = validateClaim(card, drawn);
    expect(res.valid).toBe(true);
    expect(res.patterns).toContain('BLACKOUT');
  });

  it('rejects incomplete card', () => {
    const res = validateClaim(card, [1, 2]);
    expect(res.valid).toBe(false);
  });
});