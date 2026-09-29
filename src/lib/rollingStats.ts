import type { Severity, SeverityCounts } from '../types/event.ts';

export interface WindowStats {
  readonly count: number;
  /** Average events per second over the covered part of the window. */
  readonly perSecond: number;
  /** Events in the last complete second, a near instantaneous rate. */
  readonly lastSecond: number;
  readonly bySeverity: SeverityCounts;
  /** Null when the window is empty, so the UI can show a dash instead of a misleading zero. */
  readonly avgMetric: number | null;
}

export interface TotalStats {
  readonly total: number;
  readonly bySeverity: SeverityCounts;
}

const EMPTY_COUNTS: SeverityCounts = { info: 0, warning: 0, critical: 0 };

/**
 * Time bucketed counters: one bucket per second, stored in a ring of typed arrays indexed by second % horizon.
 * record: O(1). query: O(window seconds), independent of how many events the window holds.
 */
export class RollingStats {
  private readonly horizon: number;
  private readonly seconds: Float64Array;
  private readonly counts: Uint32Array;
  private readonly info: Uint32Array;
  private readonly warning: Uint32Array;
  private readonly critical: Uint32Array;
  private readonly metricSums: Float64Array;
  private totals = { total: 0, info: 0, warning: 0, critical: 0 };
  private firstSecond: number | null = null;

  constructor(horizonSeconds: number) {
    if (!Number.isInteger(horizonSeconds) || horizonSeconds < 2) {
      throw new RangeError('RollingStats horizon must be an integer of at least 2 seconds');
    }
    this.horizon = horizonSeconds;
    this.seconds = new Float64Array(horizonSeconds).fill(-1);
    this.counts = new Uint32Array(horizonSeconds);
    this.info = new Uint32Array(horizonSeconds);
    this.warning = new Uint32Array(horizonSeconds);
    this.critical = new Uint32Array(horizonSeconds);
    this.metricSums = new Float64Array(horizonSeconds);
  }

  record(ts: number, severity: Severity, metric: number): void {
    this.totals.total += 1;
    this.totals[severity] += 1;

    const second = Math.floor(ts / 1000);
    this.firstSecond = this.firstSecond === null ? second : Math.min(this.firstSecond, second);
    const slot = second % this.horizon;
    const slotSecond = this.seconds[slot] ?? -1;
    // A late event whose slot was already reused by a newer second is only counted in totals.
    if (slotSecond > second) return;
    if (slotSecond !== second) this.resetSlot(slot, second);

    this.counts[slot] = (this.counts[slot] ?? 0) + 1;
    this.metricSums[slot] = (this.metricSums[slot] ?? 0) + metric;
    const bySeverity = this[severity];
    bySeverity[slot] = (bySeverity[slot] ?? 0) + 1;
  }

  /** Stats for the window ending at nowMs. Passing a past nowMs gives a consistent frozen view. */
  query(nowMs: number, windowMs: number): WindowStats {
    const nowSecond = Math.floor(nowMs / 1000);
    const windowSeconds = Math.min(this.horizon, Math.max(1, Math.ceil(windowMs / 1000)));
    const fromSecond = nowSecond - windowSeconds + 1;

    let count = 0;
    let info = 0;
    let warning = 0;
    let critical = 0;
    let metricSum = 0;
    let lastSecond = 0;

    for (let second = fromSecond; second <= nowSecond; second += 1) {
      const slot = ((second % this.horizon) + this.horizon) % this.horizon;
      if (this.seconds[slot] !== second) continue;
      const c = this.counts[slot] ?? 0;
      count += c;
      info += this.info[slot] ?? 0;
      warning += this.warning[slot] ?? 0;
      critical += this.critical[slot] ?? 0;
      metricSum += this.metricSums[slot] ?? 0;
      if (second === nowSecond - 1) lastSecond = c;
    }

    // Before the window has filled, divide by the time actually observed so the rate is not understated.
    const observed =
      this.firstSecond === null ? 1 : Math.max(1, Math.min(windowSeconds, nowSecond - this.firstSecond + 1));

    return {
      count,
      perSecond: count / observed,
      lastSecond,
      bySeverity: { info, warning, critical },
      avgMetric: count > 0 ? metricSum / count : null,
    };
  }

  totalsSnapshot(): TotalStats {
    const { total, info, warning, critical } = this.totals;
    return { total, bySeverity: { info, warning, critical } };
  }

  reset(): void {
    this.seconds.fill(-1);
    this.counts.fill(0);
    this.info.fill(0);
    this.warning.fill(0);
    this.critical.fill(0);
    this.metricSums.fill(0);
    this.totals = { total: 0, info: 0, warning: 0, critical: 0 };
    this.firstSecond = null;
  }

  private resetSlot(slot: number, second: number): void {
    this.seconds[slot] = second;
    this.counts[slot] = 0;
    this.info[slot] = 0;
    this.warning[slot] = 0;
    this.critical[slot] = 0;
    this.metricSums[slot] = 0;
  }
}

export const EMPTY_WINDOW_STATS: WindowStats = {
  count: 0,
  perSecond: 0,
  lastSecond: 0,
  bySeverity: EMPTY_COUNTS,
  avgMetric: null,
};

export const EMPTY_TOTALS: TotalStats = { total: 0, bySeverity: EMPTY_COUNTS };
