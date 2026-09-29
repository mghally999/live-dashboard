import { RECONNECT_BACKOFF, STABLE_CONNECTION_MS, STALE_TIMEOUT_MS } from '../config.ts';
import { backoffDelay, canRetry, type BackoffOptions } from '../lib/backoff.ts';
import type { ConnectionState, MonitorEvent } from '../types/event.ts';
import { logger } from '../utils/logger.ts';
import { parseStreamMessage } from '../utils/validate.ts';
import type { Transport, TransportFactory } from './transport.ts';

export interface StreamClientCallbacks {
  onEvent(event: MonitorEvent): void;
  onMalformed(): void;
  onConnection(state: ConnectionState): void;
}

export interface StreamClientOptions {
  readonly createTransport: TransportFactory;
  readonly callbacks: StreamClientCallbacks;
  readonly backoff?: BackoffOptions;
  readonly staleTimeoutMs?: number;
  readonly stableMs?: number;
  readonly random?: () => number;
  readonly now?: () => number;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * Owns the connection lifecycle: connecting, live, paused, reconnecting and error.
 * Every raw frame is parsed and validated here, so nothing unvalidated reaches the store.
 */
export class StreamClient {
  private readonly createTransport: TransportFactory;
  private readonly callbacks: StreamClientCallbacks;
  private readonly backoff: BackoffOptions;
  private readonly staleTimeoutMs: number;
  private readonly stableMs: number;
  private readonly random: () => number;
  private readonly now: () => number;

  private transport: Transport | null = null;
  // Incremented per connection so late callbacks from a discarded transport are ignored.
  private generation = 0;
  private running = false;
  private paused = false;
  private attempt = 0;
  private lastActivity = 0;
  private retryTimer: Timer | null = null;
  private stableTimer: Timer | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private state: ConnectionState;

  constructor(options: StreamClientOptions) {
    this.createTransport = options.createTransport;
    this.callbacks = options.callbacks;
    this.backoff = options.backoff ?? RECONNECT_BACKOFF;
    this.staleTimeoutMs = options.staleTimeoutMs ?? STALE_TIMEOUT_MS;
    this.stableMs = options.stableMs ?? STABLE_CONNECTION_MS;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.state = { status: 'connecting', attempt: 0, maxAttempts: this.backoff.maxAttempts, retryAt: null };
  }

  getState(): ConnectionState {
    return this.state;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.teardown();
    this.clearTimer('retryTimer');
  }

  /** Manual retry from the error state, starting a fresh backoff sequence. */
  retry(): void {
    if (!this.running) return;
    this.clearTimer('retryTimer');
    this.attempt = 0;
    this.connect();
  }

  /** The connection keeps running while paused. Pause only changes the reported status. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.state.status === 'live' || this.state.status === 'paused') {
      this.setState({ status: paused ? 'paused' : 'live' });
    }
  }

  private connect(): void {
    this.teardown();
    this.setState({ status: this.attempt === 0 ? 'connecting' : 'reconnecting', retryAt: null });

    const generation = ++this.generation;
    const isCurrent = () => generation === this.generation && this.running;
    this.lastActivity = this.now();
    // Also covers a connect that hangs without ever opening.
    this.staleTimer = setInterval(() => { this.checkStale(); }, Math.max(250, this.staleTimeoutMs / 4));

    const transport = this.createTransport();
    this.transport = transport;
    transport.connect({
      onOpen: () => { if (isCurrent()) this.handleOpen(); },
      onMessage: (raw) => { if (isCurrent()) this.handleMessage(raw); },
      onError: () => { if (isCurrent()) logger.warn('stream transport error'); },
      onClose: () => { if (isCurrent()) this.handleDrop(); },
    });
  }

  private handleOpen(): void {
    this.lastActivity = this.now();
    this.setState({ status: this.paused ? 'paused' : 'live', retryAt: null });
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null;
      this.attempt = 0;
      this.setState({ attempt: 0 });
    }, this.stableMs);
  }

  private handleMessage(raw: unknown): void {
    const now = this.now();
    this.lastActivity = now;
    const result = parseStreamMessage(raw, now);
    if (!result.ok) {
      this.callbacks.onMalformed();
      return;
    }
    if (result.message.type === 'event') this.callbacks.onEvent(result.message.payload);
  }

  private checkStale(): void {
    if (this.now() - this.lastActivity < this.staleTimeoutMs) return;
    logger.warn('stream stale, reconnecting', { silentMs: this.now() - this.lastActivity });
    this.handleDrop();
  }

  private handleDrop(): void {
    this.teardown();
    if (!this.running) return;

    if (!canRetry(this.attempt, this.backoff)) {
      logger.error('stream gave up after max attempts', { attempts: this.attempt });
      this.setState({ status: 'error', retryAt: null });
      return;
    }

    const delay = backoffDelay(this.attempt, this.backoff, this.random);
    this.attempt += 1;
    this.setState({ status: 'reconnecting', attempt: this.attempt, retryAt: this.now() + delay });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  /** Disposes the current transport and its timers. Retry scheduling is left to the caller. */
  private teardown(): void {
    this.generation += 1;
    this.transport?.disconnect();
    this.transport = null;
    this.clearTimer('stableTimer');
    if (this.staleTimer !== null) clearInterval(this.staleTimer);
    this.staleTimer = null;
  }

  private clearTimer(key: 'retryTimer' | 'stableTimer'): void {
    const timer = this[key];
    if (timer !== null) clearTimeout(timer);
    this[key] = null;
  }

  private setState(patch: Partial<ConnectionState>): void {
    const next: ConnectionState = { ...this.state, attempt: this.attempt, ...patch };
    if (
      next.status === this.state.status &&
      next.attempt === this.state.attempt &&
      next.retryAt === this.state.retryAt
    ) {
      return;
    }
    this.state = next;
    this.callbacks.onConnection(next);
  }
}
