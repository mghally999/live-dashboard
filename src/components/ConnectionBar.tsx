import { memo, useEffect, useState } from 'react';
import { useLiveSelector } from '../hooks/useLiveSelector.ts';
import type { LiveSnapshot } from '../store/liveStore.ts';
import type { ConnectionState } from '../types/event.ts';
import { formatInteger, formatSeconds } from '../utils/helpers.ts';
import '../styles/connection.css';

interface ConnectionBarProps {
  readonly onRetry: () => void;
}

const selectConnection = (s: LiveSnapshot) => s.connection;
const selectCounters = (s: LiveSnapshot) => s.counters;
const selectPause = (s: LiveSnapshot) => s.pause;

/** Ticks only while a retry is scheduled, so the countdown does not re-render anything else. */
function useCountdown(target: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return undefined;
    const timer = setInterval(() => { setNow(Date.now()); }, 250);
    return () => { clearInterval(timer); };
  }, [target]);

  return target === null ? null : Math.max(0, target - now);
}

function describe(state: ConnectionState, remainingMs: number | null): string {
  switch (state.status) {
    case 'connecting':
      return 'Connecting';
    case 'live':
      return 'Live';
    case 'paused':
      return 'Paused';
    case 'reconnecting': {
      const attempt = `attempt ${state.attempt} of ${state.maxAttempts}`;
      return remainingMs === null
        ? `Reconnecting (${attempt})`
        : `Connection lost. Retrying in ${formatSeconds(remainingMs)} (${attempt})`;
    }
    case 'error':
      return 'Unable to connect.';
  }
}

export const ConnectionBar = memo(function ConnectionBar({ onRetry }: ConnectionBarProps) {
  const connection = useLiveSelector(selectConnection);
  const counters = useLiveSelector(selectCounters);
  const pause = useLiveSelector(selectPause);
  const remainingMs = useCountdown(connection.status === 'reconnecting' ? connection.retryAt : null);

  return (
    <div className={`connection connection--${connection.status}`}>
      <div className="connection__status" role="status" aria-live="polite">
        <span className="connection__dot" aria-hidden="true" />
        <span>{describe(connection, remainingMs)}</span>
      </div>
      {connection.status === 'error' ? (
        <button type="button" className="button button--small button--primary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      {pause.paused ? (
        <span className="connection__paused">
          {formatInteger(pause.newWhilePaused)} new events while paused
        </span>
      ) : null}
      <ul className="connection__counters" aria-label="Stream counters">
        <li>
          <strong>{formatInteger(counters.rate)}</strong> msg/s
        </li>
        <li>
          Dropped <strong>{formatInteger(counters.dropped)}</strong>
        </li>
        <li>
          Malformed <strong>{formatInteger(counters.malformed)}</strong>
        </li>
      </ul>
    </div>
  );
});
