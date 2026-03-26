import { describe, it, expect } from 'vitest';
import { compareValues } from '../TableView';

describe('compareValues', () => {
  describe('string sort (default)', () => {
    it('sorts strings alphabetically', () => {
      expect(compareValues('alpha', 'beta')).toBeLessThan(0);
      expect(compareValues('beta', 'alpha')).toBeGreaterThan(0);
      expect(compareValues('same', 'same')).toBe(0);
    });

    it('sorts "10" after "9" lexicographically (known issue without sortType)', () => {
      // "10" < "9" in lexicographic order because "1" < "9"
      expect(compareValues('10', '9')).toBeLessThan(0);
    });
  });

  describe('number sort', () => {
    it('sorts 9 before 10 numerically', () => {
      expect(compareValues(9, 10, 'number')).toBeLessThan(0);
      expect(compareValues(10, 9, 'number')).toBeGreaterThan(0);
    });

    it('sorts string-encoded numbers correctly', () => {
      expect(compareValues('9', '10', 'number')).toBeLessThan(0);
      expect(compareValues('100', '20', 'number')).toBeGreaterThan(0);
    });

    it('treats equal numbers as equal', () => {
      expect(compareValues(5, 5, 'number')).toBe(0);
    });

    it('handles zero', () => {
      expect(compareValues(0, 5, 'number')).toBeLessThan(0);
      expect(compareValues(5, 0, 'number')).toBeGreaterThan(0);
    });

    it('handles negative numbers', () => {
      expect(compareValues(-1, 1, 'number')).toBeLessThan(0);
    });

    it('treats non-numeric values as 0', () => {
      expect(compareValues('not-a-number', 5, 'number')).toBeLessThan(0);
      expect(compareValues('abc', 'def', 'number')).toBe(0);
      expect(compareValues('-', 10, 'number')).toBeLessThan(0);
    });

    it('handles NaN and Infinity gracefully (treated as 0)', () => {
      expect(compareValues(NaN, 5, 'number')).toBeLessThan(0);
      // Infinity is not finite, so it's treated as 0
      expect(compareValues(Infinity, 5, 'number')).toBeLessThan(0);
    });
  });

  describe('date sort', () => {
    it('sorts dates chronologically', () => {
      expect(compareValues('2025-01-01T00:00:00Z', '2025-06-01T00:00:00Z', 'date')).toBeLessThan(0);
      expect(compareValues('2025-06-01T00:00:00Z', '2025-01-01T00:00:00Z', 'date')).toBeGreaterThan(0);
    });

    it('treats equal dates as equal', () => {
      expect(compareValues('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 'date')).toBe(0);
    });

    it('treats invalid date strings as 0 (epoch)', () => {
      expect(compareValues('not-a-date', '2025-01-01T00:00:00Z', 'date')).toBeLessThan(0);
    });

    it('handles "-" placeholder gracefully', () => {
      // "-" is an invalid date, treated as 0
      expect(compareValues('-', '2025-01-01T00:00:00Z', 'date')).toBeLessThan(0);
    });
  });

  describe('null/undefined handling', () => {
    it('sorts null values to the end', () => {
      expect(compareValues(null, 'a')).toBe(1);
      expect(compareValues('a', null)).toBe(-1);
    });

    it('sorts undefined values to the end', () => {
      expect(compareValues(undefined, 'a')).toBe(1);
      expect(compareValues('a', undefined)).toBe(-1);
    });

    it('treats two nulls as equal', () => {
      expect(compareValues(null, null)).toBe(0);
      expect(compareValues(undefined, undefined)).toBe(0);
      expect(compareValues(null, undefined)).toBe(0);
    });

    it('null handling applies regardless of sortType', () => {
      expect(compareValues(null, 5, 'number')).toBe(1);
      expect(compareValues(null, '2025-01-01', 'date')).toBe(1);
    });
  });

  describe('real-world restart count sorting', () => {
    it('sorts restart counts in correct numeric order', () => {
      const restarts = [10, 2, 0, 9, 100, 1];
      const sorted = [...restarts].sort((a, b) => compareValues(a, b, 'number'));
      expect(sorted).toEqual([0, 1, 2, 9, 10, 100]);
    });
  });
});
