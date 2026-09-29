import type { BackoffOptions } from './lib/backoff.ts';

export interface Range {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

export const BUFFER_SIZE: Range = { min: 500, max: 20_000, default: 5_000 };
export const FLUSH_INTERVAL_MS: Range = { min: 100, max: 1_000, default: 250 };
export const STREAM_RATE: Range = { min: 1, max: 1_000, default: 50 };

export const TIME_WINDOWS = [
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 5 * 60_000 },
  { label: '15m', ms: 15 * 60_000 },
] as const;

export const DEFAULT_WINDOW_MS = TIME_WINDOWS[0].ms;

// One bucket per second covering the largest window, plus slack so a paused view can still be queried.
export const STATS_HORIZON_SECONDS = 15 * 60 + 120;

// Compact ts/metric pairs are cheap, so the chart keeps more history than the events list.
export const CHART_BUFFER_SIZE = 20_000;
export const CHART_MAX_POINTS = 500;

// Caps the work a single flush can do. A burst larger than this drops the oldest pending events.
export const PENDING_QUEUE_LIMIT = 2_000;

export const MAX_RAW_MESSAGE_LENGTH = 4_096;
export const MAX_MESSAGE_LENGTH = 200;
export const MAX_SOURCE_LENGTH = 50;
export const MAX_ID_LENGTH = 64;
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;
export const METRIC_RANGE = { min: 0, max: 1_000_000 } as const;

export const RECONNECT_BACKOFF: BackoffOptions = {
  baseMs: 500,
  factor: 2,
  maxMs: 15_000,
  maxAttempts: 8,
};

export const STALE_TIMEOUT_MS = 5_000;
// A connection has to stay up this long before the attempt counter resets, so a flapping link keeps backing off.
export const STABLE_CONNECTION_MS = 5_000;

export const SEARCH_DEBOUNCE_MS = 200;

export const STREAM_URL: string = import.meta.env.VITE_STREAM_URL ?? '';
