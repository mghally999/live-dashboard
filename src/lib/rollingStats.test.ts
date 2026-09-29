import { describe, expect, it } from 'vitest';
import { RollingStats } from './rollingStats.ts';

const T0 = 1_700_000_000_000;

describe('RollingStats', () => {
  it('counts events and severities inside the window', () => {
    const stats = new RollingStats(60);
    stats.record(T0, 'info', 10);
    stats.record(T0 + 100, 'warning', 20);
    stats.record(T0 + 1_500, 'critical', 30);

    const result = stats.query(T0 + 1_500, 60_000);
    expect(result.count).toBe(3);
    expect(result.bySeverity).toEqual({ info: 1, warning: 1, critical: 1 });
    expect(result.avgMetric).toBe(20);
  });

  it('excludes buckets that fall outside the window', () => {
    const stats = new RollingStats(120);
    stats.record(T0, 'info', 100);
    stats.record(T0 + 30_000, 'info', 200);

    expect(stats.query(T0 + 30_000, 10_000).count).toBe(1);
    expect(stats.query(T0 + 30_000, 10_000).avgMetric).toBe(200);
    expect(stats.query(T0 + 30_000, 60_000).count).toBe(2);
  });

  it('reuses slots once the horizon wraps around', () => {
    const stats = new RollingStats(10);
    stats.record(T0, 'critical', 1);
    stats.record(T0 + 10_000, 'info', 1);

    const result = stats.query(T0 + 10_000, 10_000);
    expect(result.count).toBe(1);
    expect(result.bySeverity.critical).toBe(0);
  });

  it('keeps running totals beyond the window', () => {
    const stats = new RollingStats(10);
    for (let i = 0; i < 50; i += 1) stats.record(T0 + i * 1_000, i % 2 ? 'warning' : 'info', 5);
    expect(stats.totalsSnapshot()).toEqual({
      total: 50,
      bySeverity: { info: 25, warning: 25, critical: 0 },
    });
    expect(stats.query(T0 + 49_000, 60_000).count).toBe(10);
  });

  it('reports the rate over the observed time before the window fills', () => {
    const stats = new RollingStats(120);
    for (let s = 0; s < 4; s += 1) {
      for (let i = 0; i < 10; i += 1) stats.record(T0 + s * 1_000 + i, 'info', 1);
    }
    const result = stats.query(T0 + 3_500, 60_000);
    expect(result.perSecond).toBe(10);
    expect(result.lastSecond).toBe(10);
  });

  it('ignores late events whose slot was already reused', () => {
    const stats = new RollingStats(10);
    stats.record(T0 + 10_000, 'info', 1);
    stats.record(T0, 'critical', 1);
    expect(stats.query(T0 + 10_000, 10_000).bySeverity.critical).toBe(0);
    expect(stats.totalsSnapshot().total).toBe(2);
  });

  it('returns a null average for an empty window', () => {
    const stats = new RollingStats(10);
    expect(stats.query(T0, 5_000).avgMetric).toBeNull();
  });

  it('resets all state', () => {
    const stats = new RollingStats(10);
    stats.record(T0, 'info', 1);
    stats.reset();
    expect(stats.totalsSnapshot().total).toBe(0);
    expect(stats.query(T0, 5_000).count).toBe(0);
  });
});
