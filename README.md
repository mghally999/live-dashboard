# Live Monitoring Dashboard

A real-time monitoring dashboard built with React 19, TypeScript and Vite. It consumes a live event stream, shows KPIs, a latency chart and a virtualized events list, and stays smooth and bounded in memory at 1000 messages per second.

## Overview

I focused on two things: rendering cost that does not grow with message rate, and treating every byte from the stream as untrusted.

- A simulated socket emits raw JSON strings, including drops, malformed frames and XSS payloads. The data always arrives as a live stream, never as a hardcoded array.
- A stream client owns the connection state machine (connecting, live, paused, reconnecting, error) with exponential backoff, jitter and stale detection.
- Every frame is size checked, parsed, validated and rebuilt from whitelisted fields before it reaches the store.
- A small external store batches updates. The UI renders a few times per second regardless of message rate.
- Each widget subscribes only to its own slice through `useSyncExternalStore`.

## How to run

Requires Node 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit and component tests
npm run build      # typecheck and production build
```

Other scripts: `npm run lint`, `npm run typecheck`, `npm run preview`.

## Configuration

**Environment** (`.env`, see `.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_STREAM_URL` | empty | When set, a real WebSocket (`wss://`, or `ws://` outside production) replaces the simulated stream. |

**Settings panel** (in the UI; values are validated and clamped, defaults live in `src/config.ts`)

| Setting | Range | Default |
| --- | --- | --- |
| Buffer size | 500 to 20000 events | 5000 |
| Update throttle | 100 to 1000 ms | 250 |
| Stream rate (simulated stream) | 1 to 1000 msg/s | 50 |

## Project structure

```
src/
  components/  presentational widgets, each memoized and wrapped in an error boundary
  hooks/       store subscription (useLiveSelector), stream wiring (useLiveStream), debounce, color scheme
  services/    transport interface, simulated socket, WebSocket transport, stream client state machine
  store/       external store: ring buffers, rolling stats, batching, backpressure, pause
  lib/         pure data structures and algorithms with unit tests
  types/       domain types and the stream message union
  utils/       validation and sanitizing, formatting helpers, production silent logger
  styles/      global tokens and per component CSS
  test/        test setup and render helpers
  config.ts    limits and defaults in one place
```

## Architecture

```
Transport (mock or WebSocket)
  -> raw frame (unknown)
StreamClient
  -> size check -> JSON.parse in try/catch -> type guards -> new whitelisted object
  -> onEvent / onMalformed / onConnection
LiveStore
  -> O(1) ingest: dedupe by id, rolling stats, bounded pending queue
  -> flush at most once per interval, on an animation frame
  -> immutable, versioned snapshot with referentially stable slices
useLiveSelector(selector)  (useSyncExternalStore)
  -> KpiCards | LiveChart | EventsList | ConnectionBar   (each re-renders only for its slice)
```

`App.tsx` only does layout and wiring. It holds no live data, so it renders once and stream traffic never re-renders it. Components never touch the connection. They read from the store and call a small set of stable actions (`pause`, `resume`, `retry`).

## Performance decisions

- **Batching instead of per-message renders.** Ingestion writes to O(1) structures and marks the store dirty. Subscribers are notified at most once per throttle interval (default 250 ms), and the notification is scheduled on `requestAnimationFrame`. At 1000 msg/s the UI still renders about 4 times per second.
- **Slice level subscriptions.** Snapshots are immutable. A slice keeps its reference until its contents change: a flush that only changes counters leaves `events`, `points` and `connection` untouched. `useLiveSelector` compares by identity, so the chart does not re-render when only the dropped counter moves. Selectors are module level constants, so their identity is stable too.
- **Memoization where it pays.** `React.memo` on every widget, `KpiCard` and `EventRow`. KPI values are passed as preformatted strings, so a card whose text did not change skips rendering. `useMemo` covers the filtered event view and the downsampled chart series. `useCallback` covers handlers passed down.
- **Bounded memory.** Events live in a ring buffer sized by the settings panel. Chart points live in a separate ring of compact `{ ts, metric }` pairs (20000), so the chart can show more history than the list at a fraction of the memory.
- **Backpressure.** The queue between ingest and flush is itself a ring buffer (2000). If a burst outruns the flush, the oldest pending events are dropped and counted in the UI. It drains on the flush timer as well as the frame, so a throttled frame cannot overflow it. Stats are updated on ingest, so KPIs stay exact even when the list drops events.
- **Canvas chart.** uPlot is created once in a ref, updated with `setData`, resized with `ResizeObserver` and destroyed on unmount. The window start is found by binary search, then LTTB reduces the series to 500 points. The canvas never draws more than that.
- **Virtualized list.** `@tanstack/react-virtual` with fixed row height, newest first and stable keys (event id). Only visible rows plus a small overscan are in the DOM.
- **Hidden tab.** While the tab is hidden, flushes only drain into the buffers and skip rendering. On `visibilitychange` the latest state renders at once.
- **Paused.** The connection and stats keep running in the background. The visible snapshot is frozen, and a live "N new events while paused" counter shows what is waiting. Resume applies the latest state immediately.
- **Debounced inputs.** Search is debounced (200 ms), and settings sliders apply after 150 ms so dragging does not resize buffers on every step.

## Security decisions

- **Everything from the stream is untrusted.** Transports hand frames to the client as `unknown`. Frames over 4096 characters are rejected before `JSON.parse`, so a hostile frame cannot make parsing expensive. Parsing is wrapped in try/catch, and failures are counted, never thrown into the UI.
- **Whitelist, never spread.** Type guards check shape and types, then build a new object from known fields only. Extra keys and `__proto__` tricks are dropped. Severity must be in the enum. Numbers must be finite, and the metric is clamped to a sane range. Timestamps must be within 5 minutes of the client clock. Strings are coerced from primitives only, stripped of control, zero width and bidi override characters (which can spoof how text reads), and truncated (message 200, source 50, id 64) without splitting surrogate pairs.
- **XSS safe rendering.** Stream text is only ever rendered as React text nodes. There is no `dangerouslySetInnerHTML`, `innerHTML` or `eval` anywhere, and ESLint rules forbid them. The simulated stream deliberately sends `<img src=x onerror=alert(1)>` and `<script>` payloads, and a component test asserts that they render as literal text without creating elements.
- **Tokens.** The WebSocket transport sends a token as the first frame after open. The token is never put in the URL, where it would leak into proxy logs, history and Referer headers. It is fetched through a getter, held only in a local variable and never logged. In production the getter should call a short lived session endpoint (for example a same origin, cookie authenticated `POST /session/stream-token` returning a token valid for a minute). It should never be a value from `.env` or `localStorage`, since anything in the client bundle is public.
- **Transport hardening.** In production builds only `wss://` URLs are accepted, so a misconfigured URL cannot silently downgrade to plaintext.
- **Resilience as security.** Buffers, the pending queue and stats horizons are all bounded, so a flood cannot exhaust memory. Duplicate ids are rejected. Reconnects use capped exponential backoff with full jitter and give up after 8 attempts, moving to an error state with a manual retry. The attempt counter only resets after a connection has stayed healthy for 5 seconds, so a flapping server cannot trigger a tight reconnect loop.
- **No leaks in errors or logs.** User facing messages are generic ("Connection lost. Retrying in 4s"). The logger is silent in production and accepts only a message and numeric fields, so a payload or token cannot be logged by accident. Error boundaries show a generic fallback and do not log error details, which may contain stream data.
- **No secrets in code.** `.env` is gitignored, and `.env.example` only documents the URL.
- **Hosting headers.** I did not add a CSP meta tag because it breaks Vite's dev server. Set these at the hosting layer instead: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://your-stream-host; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. Also set `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Permissions-Policy`. (`style-src 'unsafe-inline'` covers the inline positioning styles used by the virtual list and uPlot.)

## Data structures and algorithms

| Structure | Where | Complexity | Why |
| --- | --- | --- | --- |
| `RingBuffer<T>` | `lib/ringBuffer.ts` | push O(1), toArray O(n), resize O(n) keeping newest | Hard memory ceiling for events, chart points and the pending queue. |
| `RollingStats` | `lib/rollingStats.ts` | record O(1), query O(window seconds) | One second buckets in typed array rings. Window counts per severity, rate and average metric without rescanning the event buffer. Running totals since start. |
| `lowerBoundByTs` | `lib/timeSearch.ts` | O(log n) | Buffers are time ordered (late events are pinned to the latest ts on ingest), so the window start is a binary search, not a full filter. |
| `lttb` | `lib/lttb.ts` | O(n) | Largest Triangle Three Buckets keeps peaks while reducing to 500 points. A plain stride would hide exactly the spikes a monitoring chart exists to show. |
| `backoffDelay` | `lib/backoff.ts` | O(1) | Exponential with full jitter, capped. Pure and deterministic with an injected random, which keeps the tests exact. |

## Edge cases handled

- **Dropped connection.** The simulated socket drops every 20 to 40 seconds and fails 15% of connection attempts. The client reconnects with backoff and shows the countdown and attempt number.
- **Silent connection.** If no frame (including heartbeats) arrives for 5 seconds, the client treats the connection as dead and reconnects. The same check covers a connect that never opens.
- **Retries exhausted.** After 8 failed attempts the client enters the error state with a Retry button.
- **Empty feed or filters that match nothing.** Separate empty states. A loading state shows while the first connection is pending.
- **Malformed data.** Invalid JSON, missing fields, wrong types, unknown severities, oversized frames, clock skew and binary frames are all counted as malformed and dropped.
- **Bursts.** The pending queue drops the oldest events and counts them. Stats stay exact.
- **Duplicates and ordering.** Replayed ids are rejected. Out of order timestamps are pinned so binary search stays valid.
- **Pause, filters and window changes while paused.** The frozen view stays consistent: window stats are recomputed at the frozen time.
- **Buffer resize at runtime.** The newest events are kept, and the id index is updated for evicted items.
- **Hidden tab.** Ingestion continues while rendering is skipped. Timer throttling in background tabs is absorbed by the simulated socket's capped catch up.
- **React StrictMode.** The effect creates a fresh client per run. Teardown clears every timer and listener and ignores late callbacks through a connection generation counter. A test asserts that no timers remain after stop.
- **Render errors.** Each widget has its own error boundary, so one failure does not take down the page.

## Error boundaries and the one extra dependency

React still has no hook based error boundary API: catching render errors requires `componentDidCatch` or `getDerivedStateFromError`, which exist only on class components. To keep the codebase free of class components, I use `react-error-boundary`, a small, widely used library that wraps that API behind a function component interface. `components/ErrorBoundary.tsx` adapts it with a generic fallback and a reset button.

## Profiling notes

Method, to reproduce:

1. `npm run build && npm run preview` (profile production builds; dev mode and StrictMode double rendering distort numbers).
2. Open Settings, set the stream rate to 500 msg/s, and let it run for 30 seconds.
3. React DevTools Profiler: record 10 seconds. Check that `App` does not appear in commits and that commits happen at about the throttle rate, not the message rate. Enable "Highlight updates" to confirm only the live widgets flash.
4. Chrome Performance panel: record 10 seconds with 4x CPU throttling. Look at the longest task, scripting time per flush and frame rate while scrolling the events list.
5. Memory panel: take heap snapshots at 1 and 5 minutes. Heap should plateau once the buffers are full.

### Stress run results

I drove the dev server in headless Chrome (1400x1000), raised the stream rate to 1000 msg/s from the settings panel, and let it run for about 5 seconds with the default 250 ms throttle and 5000 event buffer. I then paused, resumed and searched. The readings come from the connection bar and the page console.

| Build | Measured rate | Dropped | Console errors | `<img>` elements from hostile payloads |
| --- | --- | --- | --- | --- |
| Before: queue drained only on `requestAnimationFrame` | about 1,433 msg/s | 1,868 | 0 | 0 |
| After: queue also drained on the flush timer | about 984 msg/s | 0 | 0 | 0 |

Before the fix, the pending queue only drained inside `requestAnimationFrame`. Headless Chrome throttled frames, so bursts outran the 2000 item queue and the oldest events were dropped. Draining on the flush timer as well bounds the queue by the throttle interval rather than the frame rate. The fix brought drops to 0 at the same load. In both runs the XSS payloads in the stream rendered as literal text.

This was a short run on a dev build, so it shows correctness under load, not timing. Commit rates, long tasks and heap growth still need the production profiling method above.

## Tradeoffs

- **Hand written store instead of a state library.** The store is about 300 lines with no dependency. The snapshot and slice model maps directly onto `useSyncExternalStore`, and I control exactly when React hears about changes. A library would add a dependency and would not remove any of the batching logic.
- **Snapshot copies.** A flush copies the ring buffers into arrays (O(n), at most 20000 items, a few times per second) so snapshots are truly immutable. A persistent structure or index based views would avoid the copy, but the cost is small and the model is much simpler to reason about.
- **Client clock for windows.** Windows use the client clock, and event timestamps are validated against it with a 5 minute skew tolerance. A production system would negotiate a server time offset.
- **Late events.** Late timestamps are pinned to the latest time to keep buffers sorted. This is correct for a live view, but it means a very late event is shown at its arrival time rather than its origin time.
- **Pause freezes the view, not the connection.** This keeps stats correct in the background. The alternative, closing the socket, would lose data and make resume slower.

## What I would do next with more time

- Move parsing and validation into a Web Worker and post batches to the main thread, removing parse cost from the UI thread entirely at very high rates.
- Server time sync and gap detection using sequence numbers, with a resync request after a reconnect.
- Persist filters and settings in the URL so a view can be shared.
- Visual regression tests for the chart and an end to end test (Playwright) that runs the dashboard at 1000 msg/s and asserts on frame timing.
- Per source breakdowns and alert thresholds, with a sparkline per KPI card.
