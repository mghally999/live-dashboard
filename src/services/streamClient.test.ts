import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionState, MonitorEvent } from '../types/event.ts';
import { StreamClient } from './streamClient.ts';
import type { Transport, TransportHandlers } from './transport.ts';

class FakeTransport implements Transport {
  handlers: TransportHandlers | null = null;
  disconnected = false;
  connect(handlers: TransportHandlers): void {
    this.handlers = handlers;
  }
  disconnect(): void {
    this.disconnected = true;
  }
  send(): void {}
}

const backoff = { baseMs: 1_000, factor: 2, maxMs: 10_000, maxAttempts: 3 };

function setup() {
  const transports: FakeTransport[] = [];
  const events: MonitorEvent[] = [];
  const states: ConnectionState[] = [];
  let malformed = 0;
  const client = new StreamClient({
    createTransport: () => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    },
    callbacks: {
      onEvent: (event) => events.push(event),
      onMalformed: () => { malformed += 1; },
      onConnection: (state) => states.push(state),
    },
    backoff,
    staleTimeoutMs: 5_000,
    stableMs: 2_000,
    random: () => 1,
  });
  const current = () => transports.at(-1) as FakeTransport;
  const handlers = () => current().handlers as TransportHandlers;
  return { client, transports, events, states, current, handlers, malformed: () => malformed };
}

const validEvent = () =>
  JSON.stringify({
    type: 'event',
    payload: { id: 'a', ts: Date.now(), source: 'svc', severity: 'info', metric: 5, message: 'ok' },
  });

describe('StreamClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves from connecting to live and forwards valid events', () => {
    const { client, handlers, events, states } = setup();
    client.start();
    expect(client.getState().status).toBe('connecting');
    handlers().onOpen();
    expect(client.getState().status).toBe('live');
    handlers().onMessage(validEvent());
    expect(events).toHaveLength(1);
    expect(states.map((s) => s.status)).toEqual(['live']);
    client.stop();
  });

  it('counts malformed frames without forwarding them', () => {
    const { client, handlers, events, malformed } = setup();
    client.start();
    handlers().onOpen();
    handlers().onMessage('{not json');
    handlers().onMessage(JSON.stringify({ type: 'event', payload: { id: 1 } }));
    handlers().onMessage(new ArrayBuffer(8));
    expect(events).toHaveLength(0);
    expect(malformed()).toBe(3);
    client.stop();
  });

  it('reconnects with exponential backoff after a drop', () => {
    const { client, handlers, transports } = setup();
    client.start();
    handlers().onOpen();
    handlers().onClose();

    expect(client.getState()).toMatchObject({ status: 'reconnecting', attempt: 1, retryAt: Date.now() + 1_000 });
    vi.advanceTimersByTime(999);
    expect(transports).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(transports).toHaveLength(2);

    handlers().onClose();
    expect(client.getState()).toMatchObject({ status: 'reconnecting', attempt: 2, retryAt: Date.now() + 2_000 });
    client.stop();
  });

  it('enters the error state after max attempts and recovers on manual retry', () => {
    const { client, handlers, transports } = setup();
    client.start();
    for (let i = 0; i < backoff.maxAttempts; i += 1) {
      handlers().onClose();
      vi.runOnlyPendingTimers();
    }
    handlers().onClose();
    expect(client.getState().status).toBe('error');

    const before = transports.length;
    client.retry();
    expect(transports).toHaveLength(before + 1);
    expect(client.getState()).toMatchObject({ status: 'connecting', attempt: 0 });
    client.stop();
  });

  it('treats a silent live connection as dropped', () => {
    const { client, handlers, current } = setup();
    client.start();
    handlers().onOpen();
    const first = current();
    vi.advanceTimersByTime(6_000);
    expect(first.disconnected).toBe(true);
    expect(client.getState().status).toBe('reconnecting');
    client.stop();
  });

  it('resets the attempt counter only after the connection has been stable', () => {
    const { client, handlers } = setup();
    client.start();
    handlers().onClose();
    vi.runOnlyPendingTimers();
    handlers().onOpen();
    expect(client.getState().attempt).toBe(1);
    handlers().onMessage(validEvent());
    vi.advanceTimersByTime(2_000);
    expect(client.getState().attempt).toBe(0);
    client.stop();
  });

  it('reports paused while live and keeps forwarding events', () => {
    const { client, handlers, events } = setup();
    client.start();
    handlers().onOpen();
    client.setPaused(true);
    expect(client.getState().status).toBe('paused');
    handlers().onMessage(validEvent());
    expect(events).toHaveLength(1);
    client.setPaused(false);
    expect(client.getState().status).toBe('live');
    client.stop();
  });

  it('ignores callbacks from a discarded transport and clears every timer on stop', () => {
    const { client, handlers, events, current } = setup();
    client.start();
    const stale = handlers();
    stale.onOpen();
    client.stop();
    stale.onMessage(validEvent());
    stale.onClose();
    expect(events).toHaveLength(0);
    expect(current().disconnected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is safe to start twice, as under StrictMode double effects', () => {
    const { client, transports } = setup();
    client.start();
    client.start();
    expect(transports).toHaveLength(1);
    client.stop();
    client.start();
    expect(transports).toHaveLength(2);
    expect(transports[0]?.disconnected).toBe(true);
    client.stop();
  });
});
