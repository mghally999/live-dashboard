import { MAX_RAW_MESSAGE_LENGTH } from '../config.ts';
import type { Severity } from '../types/event.ts';
import type { Transport, TransportHandlers } from './transport.ts';

export interface MockTransportOptions {
  /** Read on every tick so the rate can change without reconnecting. */
  readonly getRate: () => number;
  readonly random?: () => number;
  readonly tickMs?: number;
  /** Uniform range for the next simulated connection drop. */
  readonly dropAfterMs?: readonly [number, number];
  readonly connectFailureRate?: number;
  readonly malformedRate?: number;
  readonly hostileRate?: number;
}

const SOURCES = [
  'api-gateway',
  'auth-service',
  'billing',
  'search',
  'checkout',
  'inventory',
  'notifications',
  'edge-cdn',
] as const;

const MESSAGES: Readonly<Record<Severity, readonly string[]>> = {
  info: ['Request served', 'Cache refreshed', 'Health check passed', 'Deployment step completed'],
  warning: ['Latency above p95 budget', 'Retrying upstream call', 'Queue depth rising', 'Slow query detected'],
  critical: ['Upstream timeout', 'Error rate above threshold', 'Circuit breaker opened', 'Disk nearly full'],
};

// Real attack strings, sent so the rendering path can be seen to treat them as plain text.
const HOSTILE_STRINGS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  'javascript:alert(document.cookie)',
] as const;

const HEARTBEAT_MS = 1_000;
// Hidden tabs throttle timers to about once a second, so emission is based on elapsed time.
// Capping the catch up models a socket buffer and still produces realistic bursts for backpressure.
const MAX_CATCH_UP_MS = 2_000;

/**
 * Simulated socket. Emits raw JSON strings so everything goes through the same parse and validate path as a
 * real server, including drops, failed connects, malformed frames and hostile content.
 */
export class MockTransport implements Transport {
  private readonly getRate: () => number;
  private readonly random: () => number;
  private readonly tickMs: number;
  private readonly dropAfterMs: readonly [number, number];
  private readonly connectFailureRate: number;
  private readonly malformedRate: number;
  private readonly hostileRate: number;

  private handlers: TransportHandlers | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastHeartbeat = 0;
  private carry = 0;
  private sequence = 0;
  private readonly sessionId: string;
  private metricBase = 120;

  constructor(options: MockTransportOptions) {
    this.getRate = options.getRate;
    this.random = options.random ?? Math.random;
    this.tickMs = options.tickMs ?? 50;
    this.dropAfterMs = options.dropAfterMs ?? [20_000, 40_000];
    this.connectFailureRate = options.connectFailureRate ?? 0.15;
    this.malformedRate = options.malformedRate ?? 0.01;
    this.hostileRate = options.hostileRate ?? 0.005;
    this.sessionId = Math.floor(this.random() * 36 ** 6).toString(36);
  }

  connect(handlers: TransportHandlers): void {
    this.handlers = handlers;
    const latency = 200 + this.random() * 600;
    this.schedule(latency, () => {
      if (this.random() < this.connectFailureRate) {
        this.fail();
        return;
      }
      this.handlers?.onOpen();
      this.lastTick = Date.now();
      this.lastHeartbeat = this.lastTick;
      this.tickTimer = setInterval(() => { this.tick(); }, this.tickMs);
      const [minDrop, maxDrop] = this.dropAfterMs;
      this.schedule(minDrop + this.random() * (maxDrop - minDrop), () => { this.fail(); });
    });
  }

  disconnect(): void {
    this.handlers = null;
    this.clearTimers();
  }

  send(): void {
    // The simulated server accepts any client message, including an auth frame.
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = Math.min(now - this.lastTick, MAX_CATCH_UP_MS);
    this.lastTick = now;

    const rate = this.getRate();
    // Occasional short spikes make bursts visible even at modest rates.
    const burst = this.random() < 0.02 ? 3 + this.random() * 5 : 1;
    this.carry += (rate * burst * elapsed) / 1000;
    const count = Math.floor(this.carry);
    this.carry -= count;

    for (let i = 0; i < count && this.handlers; i += 1) {
      this.handlers.onMessage(this.nextFrame(now));
    }

    if (now - this.lastHeartbeat >= HEARTBEAT_MS) {
      this.lastHeartbeat = now;
      this.handlers?.onMessage(JSON.stringify({ type: 'heartbeat', ts: now }));
    }
  }

  private nextFrame(now: number): string {
    const roll = this.random();
    if (roll < this.malformedRate) return this.malformedFrame(now);

    this.sequence += 1;
    this.metricBase = Math.min(900, Math.max(20, this.metricBase + (this.random() - 0.5) * 12));
    const severity = this.pickSeverity();
    const spike = severity === 'critical' ? 300 + this.random() * 600 : severity === 'warning' ? 80 + this.random() * 150 : 0;
    const hostile = roll < this.malformedRate + this.hostileRate;

    return JSON.stringify({
      type: 'event',
      payload: {
        id: `${this.sessionId}-${this.sequence}`,
        ts: now,
        source: hostile && this.random() < 0.5 ? this.pick(HOSTILE_STRINGS) : this.pick(SOURCES),
        severity,
        metric: Math.round((this.metricBase + spike + this.random() * 30) * 10) / 10,
        message: hostile ? this.pick(HOSTILE_STRINGS) : this.pick(MESSAGES[severity]),
      },
    });
  }

  private malformedFrame(now: number): string {
    const kinds = [
      () => '{"type":"event","payload":{"id":',
      () => JSON.stringify({ type: 'event', payload: { id: 'x', ts: now, severity: 'info' } }),
      () => JSON.stringify({ type: 'event', payload: { id: 'x', ts: now, source: 's', severity: 'fatal', metric: 1, message: 'm' } }),
      () => JSON.stringify({ type: 'event', payload: { id: 'x', ts: 'now', source: 's', severity: 'info', metric: '12ms', message: 'm' } }),
      () => JSON.stringify({ type: 'event', payload: { id: 'x', ts: now, source: 's', severity: 'info', metric: 1, message: 'A'.repeat(MAX_RAW_MESSAGE_LENGTH) } }),
      () => JSON.stringify({ type: 'unknown', payload: null }),
    ];
    return this.pick(kinds)();
  }

  private pickSeverity(): Severity {
    const r = this.random();
    if (r < 0.03) return 'critical';
    if (r < 0.15) return 'warning';
    return 'info';
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)] as T;
  }

  private fail(): void {
    const handlers = this.handlers;
    this.disconnect();
    handlers?.onError();
    handlers?.onClose();
  }

  private schedule(delay: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== timer);
      fn();
    }, delay);
    this.timers.push(timer);
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }
}
