import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useMemo, useRef } from 'react';
import { useLiveSelector } from '../hooks/useLiveSelector.ts';
import { lowerBoundByTs } from '../lib/timeSearch.ts';
import type { LiveSnapshot } from '../store/liveStore.ts';
import { SEVERITIES, type MonitorEvent } from '../types/event.ts';
import { formatInteger } from '../utils/helpers.ts';
import { EmptyState } from './EmptyState.tsx';
import { EventRow, ROW_HEIGHT } from './EventRow.tsx';
import { Loading } from './Loading.tsx';
import '../styles/events.css';

const selectEvents = (s: LiveSnapshot) => s.events;
const selectNow = (s: LiveSnapshot) => s.now;
const selectFilters = (s: LiveSnapshot) => s.filters;
const selectConnecting = (s: LiveSnapshot) => s.connection.status === 'connecting' && s.totals.total === 0;

// Lets the first rows render before the viewport has been measured.
const INITIAL_RECT = { width: 800, height: 420 };

export const EventsList = memo(function EventsList() {
  const events = useLiveSelector(selectEvents);
  const now = useLiveSelector(selectNow);
  const filters = useLiveSelector(selectFilters);
  const connecting = useLiveSelector(selectConnecting);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Window start by binary search, then a single backwards pass so rows come out newest first. O(log n + k).
  const rows = useMemo<readonly MonitorEvent[]>(() => {
    const start = lowerBoundByTs(events, now - filters.windowMs);
    const allSeverities = filters.severities.length === SEVERITIES.length;
    const { query } = filters;
    const out: MonitorEvent[] = [];
    for (let i = events.length - 1; i >= start; i -= 1) {
      const event = events[i] as MonitorEvent;
      if (!allSeverities && !filters.severities.includes(event.severity)) continue;
      if (query && !event.source.toLowerCase().includes(query) && !event.message.toLowerCase().includes(query)) {
        continue;
      }
      out.push(event);
    }
    return out;
  }, [events, now, filters]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 8,
    initialRect: INITIAL_RECT,
  });

  const isFiltered = filters.query !== '' || filters.severities.length !== SEVERITIES.length;

  let body;
  if (connecting) {
    body = <Loading />;
  } else if (rows.length === 0) {
    body = isFiltered ? (
      <EmptyState title="No events match the current filters" hint="Try another severity, search or time window." />
    ) : (
      <EmptyState title="No events yet" hint="New events will appear here as they arrive." />
    );
  } else {
    body = (
      <div ref={viewportRef} className="events__viewport" role="rowgroup">
        <div className="events__inner" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const event = rows[item.index];
            return event ? <EventRow key={event.id} event={event} offset={item.start} /> : null;
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="panel events" aria-labelledby="events-title">
      <header className="panel__header">
        <h2 id="events-title" className="panel__title">
          Recent events
        </h2>
        <span className="panel__meta">{formatInteger(rows.length)} shown</span>
      </header>
      <div role="table" aria-labelledby="events-title" aria-rowcount={rows.length}>
        <div className="events__header" role="row">
          <span role="columnheader">Time</span>
          <span role="columnheader">Severity</span>
          <span role="columnheader">Source</span>
          <span role="columnheader">Message</span>
        </div>
        {body}
      </div>
    </section>
  );
});
