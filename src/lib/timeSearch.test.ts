import { describe, expect, it } from 'vitest';
import { lowerBoundByTs } from './timeSearch.ts';

const items = [10, 20, 20, 30, 40].map((ts) => ({ ts }));

describe('lowerBoundByTs', () => {
  it('finds the first item at or after the target', () => {
    expect(lowerBoundByTs(items, 20)).toBe(1);
    expect(lowerBoundByTs(items, 25)).toBe(3);
  });

  it('handles targets before the first and after the last item', () => {
    expect(lowerBoundByTs(items, 0)).toBe(0);
    expect(lowerBoundByTs(items, 41)).toBe(items.length);
  });

  it('handles an empty array', () => {
    expect(lowerBoundByTs([], 5)).toBe(0);
  });

  it('matches a linear scan on a large input', () => {
    const large = Array.from({ length: 10_000 }, (_, i) => ({ ts: Math.floor(i / 3) }));
    for (const target of [0, 1, 999, 1_500, 3_333, 5_000]) {
      const expected = large.findIndex((item) => item.ts >= target);
      expect(lowerBoundByTs(large, target)).toBe(expected === -1 ? large.length : expected);
    }
  });
});
