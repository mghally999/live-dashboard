import {
  BUFFER_SIZE,
  CHART_BUFFER_SIZE,
  DEFAULT_WINDOW_MS,
  FLUSH_INTERVAL_MS,
  PENDING_QUEUE_LIMIT,
  STATS_HORIZON_SECONDS,
  STREAM_RATE,
} from '../config.ts';
import { RingBuffer } from '../lib/ringBuffer.ts';
import { EMPTY_TOTALS, EMPTY_WINDOW_STATS, RollingStats, type TotalStats, type WindowStats } from '../lib/rollingStats.ts';
import {
  SEVERITIES,
  type ChartPoint,
  type ConnectionState,
  type MonitorEvent,
  type Severity,
} from '../types/event.ts';
import { clampInt } from '../utils/helpers.ts';

export interface Settings {
  readonly bufferSize: number;
  readonly flushMs: number;
  readonly rate: number;
}

export interface Filters {
  readonly severities: readonly Severity[];
  readonly query: string;
  readonly windowMs: number;
}

export interface Counters {
  readonly received: number;
  /** Rejected by validation, or a duplicate id. */
  readonly malformed: number;
  /** Accepted but discarded by backpressure before reaching the buffers. */
  readonly dropped: number;
  /** Events received in the last complete second, independent of pause. */
  readonly rate: number;
}

export interface PauseState {
  readonly paused: boolean;
  readonly newWhilePaused: number;
}

/** Immutable. Each slice keeps its reference until its content changes, so selectors can compare by identity. */
export interface LiveSnapshot {
  readonly version: number;
  /** Time the visible data refers to. Frozen while paused. */
  readonly now: number;
  /** Chronological, oldest first. */
  readonly events: readonly MonitorEvent[];
  readonly points: readonly ChartPoint[];
  readonly windowStats: WindowStats;
  readonly totals: TotalStats;
  readonly connection: ConnectionState;
  readonly counters: Counters;
  readonly pause: PauseState;
  readonly filters: Filters;
  readonly settings: Settings;
}

export interface LiveStoreOptions {
  readonly settings?: Partial<Settings>;
  readonly now?: () => number;
  readonly requestFrame?: (callback: () => void) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly isHidden?: () => boolean;
}

type Listener = () => void;

export const DEFAULT_SETTINGS: Settings = {
  bufferSize: BUFFER_SIZE.default,
  flushMs: FLUSH_INTERVAL_MS.default,
  rate: STREAM_RATE.default,
};

export function clampSettings(input: Partial<Settings>, base: Settings = DEFAULT_SETTINGS): Settings {
  return {
    bufferSize: clampInt(input.bufferSize ?? base.bufferSize, BUFFER_SIZE.min, BUFFER_SIZE.max, base.bufferSize),
    flushMs: clampInt(input.flushMs ?? base.flushMs, FLUSH_INTERVAL_MS.min, FLUSH_INTERVAL_MS.max, base.flushMs),
    rate: clampInt(input.rate ?? base.rate, STREAM_RATE.min, STREAM_RATE.max, base.rate),
  };
}

const IDLE_TICK_MS = 1_000;

/**
 * External store for the live dashboard. Ingestion is O(1) per event and never notifies React directly:
 * subscribers hear about changes at most once per flush interval, on an animation frame.
 */
export class LiveStore {
  private readonly now: () => number;
  private readonly requestFrame: (callback: () => void) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly isHidden: () => boolean;
  private readonly listeners = new Set<Listener>();

  private settings: Settings;
  private readonly pending = new RingBuffer<MonitorEvent>(PENDING_QUEUE_LIMIT);
  private events: RingBuffer<MonitorEvent>;
  private readonly points = new RingBuffer<ChartPoint>(CHART_BUFFER_SIZE);
  private readonly stats = new RollingStats(STATS_HORIZON_SECONDS);
  // Ids currently held in pending or events, to drop replays. Kept in sync on every eviction.
  private readonly ids = new Set<string>();
  private lastTs = 0;

  private received = 0;
  private malformed = 0;
  private dropped = 0;
  private newWhilePaused = 0;
  private paused = false;
  private connection: ConnectionState;
  private filters: Filters;

  private dataChanged = false;
  private dirty = false;
  private snapshot: LiveSnapshot;
  private lastFlushAt = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private frame: number | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LiveStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.requestFrame = options.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((handle) => { cancelAnimationFrame(handle); });
    this.isHidden = options.isHidden ?? (() => typeof document !== 'undefined' && document.hidden);
    this.settings = clampSettings(options.settings ?? {});
    this.events = new RingBuffer<MonitorEvent>(this.settings.bufferSize);
    this.connection = { status: 'connecting', attempt: 0, maxAttempts: 0, retryAt: null };
    this.filters = { severities: SEVERITIES, query: '', windowMs: DEFAULT_WINDOW_MS };
    this.snapshot = {
      version: 0,
      now: this.now(),
      events: [],
      points: [],
      windowStats: EMPTY_WINDOW_STATS,
      totals: EMPTY_TOTALS,
      connection: this.connection,
      counters: { received: 0, malformed: 0, dropped: 0, rate: 0 },
      pause: { paused: false, newWhilePaused: 0 },
      filters: this.filters,
      settings: this.settings,
    };
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): LiveSnapshot => this.snapshot;

  getSettings(): Settings {
    return this.settings;
  }

  /** Starts background timers. Returns a disposer so it pairs naturally with a React effect. */
  start(): () => void {
    // Keeps rolling windows decaying and the rate accurate when the stream goes quiet.
    this.idleTimer = setInterval(() => { this.markDirty(false); }, IDLE_TICK_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleVisibility);
    return () => { this.stop(); };
  }

  stop(): void {
    if (this.idleTimer !== null) clearInterval(this.idleTimer);
    this.idleTimer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibility);
    this.cancelScheduledFlush();
  }

  ingest(event: MonitorEvent): void {
    if (this.ids.has(event.id)) {
      this.malformed += 1;
      this.markDirty(false);
      return;
    }
    // Buffers must stay sorted for binary search, so a slightly late event is pinned to the latest time.
    const ordered = event.ts < this.lastTs ? { ...event, ts: this.lastTs } : event;
    this.lastTs = ordered.ts;

    this.received += 1;
    this.stats.record(ordered.ts, ordered.severity, ordered.metric);
    if (this.paused) this.newWhilePaused += 1;

    this.ids.add(ordered.id);
    const evicted = this.pending.push(ordered);
    if (evicted) {
      this.ids.delete(evicted.id);
      this.dropped += 1;
    }
    this.markDirty(true);
  }

  recordMalformed(): void {
    this.malformed += 1;
    this.markDirty(false);
  }

  setConnection(state: ConnectionState): void {
    this.connection = state;
    this.markDirty(false);
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.newWhilePaused = 0;
    this.flushNow();
  }

  setFilters(patch: Partial<Filters>): void {
    this.filters = { ...this.filters, ...patch };
    this.flushNow();
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = clampSettings(patch, this.settings);
    if (next.bufferSize !== this.settings.bufferSize) {
      this.drain();
      for (const removed of this.events.resize(next.bufferSize)) this.ids.delete(removed.id);
      this.dataChanged = true;
    }
    this.settings = next;
    this.flushNow();
    return next;
  }

  /** Applies everything immediately. Used for user actions so the UI responds without waiting for a tick. */
  flushNow(): void {
    this.cancelScheduledFlush();
    this.flush();
  }

  private markDirty(data: boolean): void {
    if (data) this.dataChanged = true;
    this.dirty = true;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null || this.frame !== null) return;
    const wait = Math.max(0, this.lastFlushAt + this.settings.flushMs - this.now());
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      // Draining here as well as in the frame means a delayed or throttled frame cannot overflow the queue.
      this.drain();
      if (this.isHidden()) {
        // Nothing is painted while hidden: keep ingesting, render on return.
        this.lastFlushAt = this.now();
        return;
      }
      this.frame = this.requestFrame(() => {
        this.frame = null;
        this.flush();
      });
    }, wait);
  }

  private cancelScheduledFlush(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
  }

  private readonly handleVisibility = (): void => {
    if (!this.isHidden() && this.dirty) this.flushNow();
  };

  /** Moves pending events into the bounded buffers. Bounded by PENDING_QUEUE_LIMIT per call. */
  private drain(): void {
    let item = this.pending.shift();
    while (item !== undefined) {
      const evicted = this.events.push(item);
      if (evicted) this.ids.delete(evicted.id);
      this.points.push({ ts: item.ts, metric: item.metric });
      item = this.pending.shift();
    }
  }

  private flush(): void {
    this.drain();
    this.lastFlushAt = this.now();
    this.dirty = false;

    const prev = this.snapshot;
    const now = this.now();
    const { windowMs } = this.filters;

    let { events, points, windowStats, totals } = prev;
    let viewNow = prev.now;
    if (!this.paused) {
      viewNow = now;
      if (this.dataChanged) {
        events = this.events.toArray();
        points = this.points.toArray();
        this.dataChanged = false;
      }
      windowStats = sameWindowStats(prev.windowStats, this.stats.query(now, windowMs));
      totals = sameTotals(prev.totals, this.stats.totalsSnapshot());
    } else if (windowMs !== prev.filters.windowMs) {
      // Paused view stays consistent: window stats are recomputed at the frozen time.
      windowStats = this.stats.query(prev.now, windowMs);
    }

    const rate = this.stats.query(now, 2_000).lastSecond;
    const counters =
      prev.counters.received === this.received &&
      prev.counters.malformed === this.malformed &&
      prev.counters.dropped === this.dropped &&
      prev.counters.rate === rate
        ? prev.counters
        : { received: this.received, malformed: this.malformed, dropped: this.dropped, rate };
    const pause =
      prev.pause.paused === this.paused && prev.pause.newWhilePaused === this.newWhilePaused
        ? prev.pause
        : { paused: this.paused, newWhilePaused: this.newWhilePaused };

    this.snapshot = {
      version: prev.version + 1,
      now: viewNow,
      events,
      points,
      windowStats,
      totals,
      connection: this.connection,
      counters,
      pause,
      filters: this.filters,
      settings: this.settings,
    };
    this.listeners.forEach((listener) => { listener(); });
  }
}

function sameWindowStats(prev: WindowStats, next: WindowStats): WindowStats {
  return prev.count === next.count &&
    prev.perSecond === next.perSecond &&
    prev.lastSecond === next.lastSecond &&
    prev.avgMetric === next.avgMetric &&
    prev.bySeverity.info === next.bySeverity.info &&
    prev.bySeverity.warning === next.bySeverity.warning &&
    prev.bySeverity.critical === next.bySeverity.critical
    ? prev
    : next;
}

function sameTotals(prev: TotalStats, next: TotalStats): TotalStats {
  return prev.total === next.total ? prev : next;
}
