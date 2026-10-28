'use strict';

const { generateCard, validateCard, getCardSignature, areCardsEqual, findDuplicateCard, flatten, COLUMN_RANGES } = require('../src/utils/bingoCard');

describe('Bingo card generation', () => {
  it('generates a 5x5 row-major card', () => {
    const card = generateCard();
    expect(Array.isArray(card)).toBe(true);
    expect(card).toHaveLength(5);
    for (const row of card) {
      expect(Array.isArray(row)).toBe(true);
      expect(row).toHaveLength(5);
    }
  });

  it('has FREE in the center and 24 unique numeric cells', () => {
    const card = generateCard();
    expect(card[2][2]).toBe(0);
    const numbers = flatten(card).filter((value) => value !== 0);
    expect(numbers).toHaveLength(24);
    expect(new Set(numbers).size).toBe(24);
  });

  it('uses the correct B/I/N/G/O ranges', () => {
    const card = generateCard();
    for (let col = 0; col < 5; col += 1) {
      const [min, max] = COLUMN_RANGES[col];
      for (let row = 0; row < 5; row += 1) {
        const value = card[row][col];
        if (value !== 0) {
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('sorts each numeric column in ascending order', () => {
    const card = generateCard();
    for (let col = 0; col < 5; col += 1) {
      const values = [];
      for (let row = 0; row < 5; row += 1) {
        if (card[row][col] !== 0) values.push(card[row][col]);
      }
      const sorted = values.slice().sort((a, b) => a - b);
      expect(values).toEqual(sorted);
    }
  });

  it('validates generated cards', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(validateCard(generateCard()).valid).toBe(true);
    }
  });

  it('produces stable canonical signatures', () => {
    const card = generateCard();
    expect(getCardSignature(card)).toBe(getCardSignature(card));
  });

  it('detects duplicate cards', () => {
    const card = generateCard();
    expect(areCardsEqual(card, card)).toBe(true);
    expect(findDuplicateCard(card, [card])).toBe(true);
    expect(findDuplicateCard(generateCard(), [card])).toBe(false);
  });

  it('rejects malformed and invalid cards', () => {
    expect(validateCard(null).valid).toBe(false);
    expect(validateCard([[1]]).valid).toBe(false);

    const badCenter = generateCard();
    badCenter[2][2] = 42;
    expect(validateCard(badCenter).valid).toBe(false);

    const outOfRange = generateCard();
    outOfRange[0][0] = 16;
    expect(validateCard(outOfRange).valid).toBe(false);

    const duplicate = generateCard();
    duplicate[1][0] = duplicate[0][0];
    expect(validateCard(duplicate).valid).toBe(false);
  });
});