export const SEVERITIES = ['info', 'warning', 'critical'] as const;

export type Severity = (typeof SEVERITIES)[number];

export interface MonitorEvent {
  readonly id: string;
  /** Epoch milliseconds. */
  readonly ts: number;
  readonly source: string;
  readonly severity: Severity;
  /** Latency in milliseconds. */
  readonly metric: number;
  readonly message: string;
}

export type ConnectionStatus = 'connecting' | 'live' | 'paused' | 'reconnecting' | 'error';

export type StreamMessage =
  | { readonly type: 'event'; readonly payload: MonitorEvent }
  | { readonly type: 'heartbeat'; readonly ts: number };

export interface ConnectionState {
  readonly status: ConnectionStatus;
  /** Reconnect attempt number, 0 while healthy. */
  readonly attempt: number;
  readonly maxAttempts: number;
  /** Epoch ms of the next scheduled reconnect, null when none is pending. */
  readonly retryAt: number | null;
}

export interface ChartPoint {
  readonly ts: number;
  readonly metric: number;
}

export type SeverityCounts = Readonly<Record<Severity, number>>;
