import { describe, expect, it } from 'vitest';
import { lttb } from './lttb.ts';

interface P {
  ts: number;
  v: number;
}
const x = (p: P) => p.ts;
const y = (p: P) => p.v;
const series = (n: number, f: (i: number) => number): P[] =>
  Array.from({ length: n }, (_, i) => ({ ts: i, v: f(i) }));

describe('lttb', () => {
  it('returns a copy when the input is already under the threshold', () => {
    const data = series(10, (i) => i);
    const result = lttb(data, 20, x, y);
    expect(result).toEqual(data);
    expect(result).not.toBe(data);
  });

  it('reduces to exactly the threshold and keeps both endpoints', () => {
    const data = series(10_000, (i) => Math.sin(i / 50));
    const result = lttb(data, 500, x, y);
    expect(result).toHaveLength(500);
    expect(result[0]).toBe(data[0]);
    expect(result.at(-1)).toBe(data.at(-1));
  });

  it('keeps output ordered by x', () => {
    const result = lttb(series(5_000, (i) => (i * 7919) % 101), 200, x, y);
    for (let i = 1; i < result.length; i += 1) {
      expect((result[i] as P).ts).toBeGreaterThan((result[i - 1] as P).ts);
    }
  });

  it('preserves an isolated spike', () => {
    const data = series(5_000, (i) => (i === 2_345 ? 1_000 : 1));
    const result = lttb(data, 100, x, y);
    expect(result.some((p) => p.v === 1_000)).toBe(true);
  });

  it('ignores thresholds below 3', () => {
    const data = series(50, (i) => i);
    expect(lttb(data, 2, x, y)).toHaveLength(50);
  });
});
