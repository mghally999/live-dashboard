import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_QUEUE_LIMIT } from '../config.ts';
import type { MonitorEvent } from '../types/event.ts';
import { LiveStore } from './liveStore.ts';

let seq = 0;
function makeEvent(overrides: Partial<MonitorEvent> = {}): MonitorEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    ts: Date.now(),
    source: 'svc',
    severity: 'info',
    metric: 10,
    message: 'ok',
    ...overrides,
  };
}

function createStore(settings = {}) {
  return new LiveStore({
    settings,
    requestFrame: (cb) => setTimeout(cb, 0),
    cancelFrame: (handle) => { clearTimeout(handle); },
    isHidden: () => false,
  });
}

describe('LiveStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches notifications to at most one per flush interval', () => {
    const store = createStore({ flushMs: 250 });
    const listener = vi.fn();
    store.subscribe(listener);

    for (let i = 0; i < 1_000; i += 1) store.ingest(makeEvent());
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(260);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().events).toHaveLength(1_000);
  });

  it('keeps memory bounded by the buffer size', () => {
    const store = createStore({ bufferSize: 500 });
    for (let i = 0; i < 1_500; i += 1) {
      store.ingest(makeEvent());
      if (i % 400 === 0) store.flushNow();
    }
    store.flushNow();
    const { events, totals } = store.getSnapshot();
    expect(events).toHaveLength(500);
    expect(events.at(-1)?.id).toBe(`e${seq}`);
    expect(totals.total).toBe(1_500);
  });

  it('drops the oldest pending events when a burst exceeds the queue', () => {
    const store = createStore({ bufferSize: 20_000 });
    const burst = PENDING_QUEUE_LIMIT + 300;
    for (let i = 0; i < burst; i += 1) store.ingest(makeEvent());
    store.flushNow();

    const { counters, events, totals } = store.getSnapshot();
    expect(counters.dropped).toBe(300);
    expect(events).toHaveLength(PENDING_QUEUE_LIMIT);
    // Stats are updated on ingest, so KPIs stay exact even when the list is lossy.
    expect(totals.total).toBe(burst);
  });

  it('freezes the visible data while paused and applies the latest state on resume', () => {
    const store = createStore();
    store.ingest(makeEvent());
    store.flushNow();
    store.setPaused(true);
    const frozen = store.getSnapshot();

    store.ingest(makeEvent());
    store.ingest(makeEvent());
    store.flushNow();
    const paused = store.getSnapshot();
    expect(paused.events).toBe(frozen.events);
    expect(paused.totals).toBe(frozen.totals);
    expect(paused.pause.newWhilePaused).toBe(2);
    expect(paused.counters.received).toBe(3);

    store.setPaused(false);
    expect(store.getSnapshot().events).toHaveLength(3);
    expect(store.getSnapshot().pause).toEqual({ paused: false, newWhilePaused: 0 });
  });

  it('rejects duplicate ids and keeps events sorted by time', () => {
    const store = createStore();
    const first = makeEvent({ ts: Date.now() });
    store.ingest(first);
    store.ingest(first);
    store.ingest(makeEvent({ ts: Date.now() - 5_000 }));
    store.flushNow();

    const { events, counters } = store.getSnapshot();
    expect(events).toHaveLength(2);
    expect(counters.malformed).toBe(1);
    expect(events[1]?.ts).toBeGreaterThanOrEqual(events[0]?.ts ?? 0);
  });

  it('keeps unchanged slices referentially stable', () => {
    const store = createStore();
    store.ingest(makeEvent());
    store.flushNow();
    const before = store.getSnapshot();
    store.recordMalformed();
    store.flushNow();
    const after = store.getSnapshot();
    expect(after.version).toBe(before.version + 1);
    expect(after.events).toBe(before.events);
    expect(after.connection).toBe(before.connection);
    expect(after.counters).not.toBe(before.counters);
  });

  it('clamps settings and resizes the buffer keeping the newest events', () => {
    const store = createStore({ bufferSize: 1_000 });
    for (let i = 0; i < 800; i += 1) store.ingest(makeEvent());
    const applied = store.updateSettings({ bufferSize: 10, flushMs: 5, rate: 99_999 });
    expect(applied).toEqual({ bufferSize: 500, flushMs: 100, rate: 1_000 });
    expect(store.getSnapshot().events).toHaveLength(500);
    expect(store.getSnapshot().events.at(-1)?.id).toBe(`e${seq}`);
  });

  it('cleans up timers when stopped', () => {
    const store = createStore();
    const stop = store.start();
    store.ingest(makeEvent());
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
