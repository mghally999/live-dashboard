import { memo, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { SEARCH_DEBOUNCE_MS, TIME_WINDOWS } from '../config.ts';
import { useDebouncedValue } from '../hooks/useDebouncedValue.ts';
import { useLiveSelector, useLiveStore } from '../hooks/useLiveSelector.ts';
import type { LiveSnapshot } from '../store/liveStore.ts';
import { SEVERITIES, type Severity } from '../types/event.ts';
import { Icon } from './Icon.tsx';
import '../styles/controls.css';

interface ControlsProps {
  readonly onPause: () => void;
  readonly onResume: () => void;
}

const selectPaused = (s: LiveSnapshot) => s.pause.paused;
const selectFilters = (s: LiveSnapshot) => s.filters;

const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

const MAX_QUERY_LENGTH = 100;

export const Controls = memo(function Controls({ onPause, onResume }: ControlsProps) {
  const store = useLiveStore();
  const paused = useLiveSelector(selectPaused);
  const filters = useLiveSelector(selectFilters);
  const [query, setQuery] = useState(filters.query);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    store.setFilters({ query: debouncedQuery.trim().toLowerCase() });
  }, [store, debouncedQuery]);

  const toggleSeverity = useCallback(
    (severity: Severity) => {
      const current = store.getSnapshot().filters.severities;
      const next = current.includes(severity)
        ? current.filter((s) => s !== severity)
        : SEVERITIES.filter((s) => s === severity || current.includes(s));
      store.setFilters({ severities: next });
    },
    [store],
  );

  const handleWindow = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const windowMs = TIME_WINDOWS.find((w) => String(w.ms) === event.target.value)?.ms;
      if (windowMs !== undefined) store.setFilters({ windowMs });
    },
    [store],
  );

  const handleQuery = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value.slice(0, MAX_QUERY_LENGTH));
  }, []);

  return (
    <div className="controls">
      <button
        type="button"
        className={`button controls__pause ${paused ? 'button--primary' : ''}`}
        aria-pressed={paused}
        onClick={paused ? onResume : onPause}
      >
        <Icon name={paused ? 'play' : 'pause'} />
        {paused ? 'Resume' : 'Pause'}
      </button>

      <fieldset className="controls__group">
        <legend className="micro-label">Severity</legend>
        <div className="controls__toggles">
          {SEVERITIES.map((severity) => (
            <button
              key={severity}
              type="button"
              className={`toggle toggle--${severity}`}
              aria-pressed={filters.severities.includes(severity)}
              onClick={() => { toggleSeverity(severity); }}
            >
              <span className="toggle__dot" aria-hidden="true" />
              {SEVERITY_LABELS[severity]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="controls__group">
        <span className="micro-label">Time window</span>
        <select className="select" value={filters.windowMs} onChange={handleWindow}>
          {TIME_WINDOWS.map((w) => (
            <option key={w.ms} value={w.ms}>
              Last {w.label}
            </option>
          ))}
        </select>
      </label>

      <label className="controls__group">
        <span className="micro-label">Search</span>
        <span className="input-wrap">
          <Icon name="search" className="icon input-wrap__icon" />
          <input
            className="input"
            type="search"
            placeholder="Source or message"
            value={query}
            maxLength={MAX_QUERY_LENGTH}
            onChange={handleQuery}
            autoComplete="off"
            spellCheck={false}
          />
        </span>
      </label>
    </div>
  );
});
