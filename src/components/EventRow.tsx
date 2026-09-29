import { memo } from 'react';
import type { MonitorEvent } from '../types/event.ts';
import { formatTime } from '../utils/helpers.ts';

export const ROW_HEIGHT = 36;

interface EventRowProps {
  readonly event: MonitorEvent;
  readonly offset: number;
}

/** Stream text is only ever rendered as React text nodes, which React escapes. */
export const EventRow = memo(function EventRow({ event, offset }: EventRowProps) {
  return (
    <div
      className="event-row"
      role="row"
      style={{ height: ROW_HEIGHT, transform: `translateY(${offset}px)` }}
    >
      <span className="event-row__time" role="cell">
        {formatTime(event.ts)}
      </span>
      <span role="cell">
        <span className={`badge badge--${event.severity}`}>{event.severity}</span>
      </span>
      <span className="event-row__source" role="cell" title={event.source}>
        {event.source}
      </span>
      <span className="event-row__message" role="cell" title={event.message}>
        {event.message}
      </span>
    </div>
  );
});
