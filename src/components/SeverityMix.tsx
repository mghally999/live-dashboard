import { memo } from 'react';
import { TIME_WINDOWS } from '../config.ts';
import { useLiveSelector } from '../hooks/useLiveSelector.ts';
import type { LiveSnapshot } from '../store/liveStore.ts';
import { SEVERITIES, type Severity } from '../types/event.ts';
import { formatInteger } from '../utils/helpers.ts';
import '../styles/mix.css';

const selectBySeverity = (s: LiveSnapshot) => s.windowStats.bySeverity;
const selectWindowMs = (s: LiveSnapshot) => s.filters.windowMs;

const LABELS: Readonly<Record<Severity, string>> = { info: 'Info', warning: 'Warning', critical: 'Critical' };

function percent(part: number, total: number): string {
  if (total === 0) return '0%';
  const value = (part / total) * 100;
  return `${value < 1 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

/** Share of each severity in the current window. Segment widths are static per render, never transitioned. */
export const SeverityMix = memo(function SeverityMix() {
  const counts = useLiveSelector(selectBySeverity);
  const windowMs = useLiveSelector(selectWindowMs);
  const total = counts.info + counts.warning + counts.critical;
  const windowLabel = TIME_WINDOWS.find((w) => w.ms === windowMs)?.label ?? '';
  const summary = SEVERITIES.map((s) => `${LABELS[s]} ${percent(counts[s], total)}`).join(', ');

  return (
    <section className="mix" aria-label="Severity mix">
      <div className="mix__head">
        <span className="micro-label">Severity mix, last {windowLabel}</span>
        <span className="mix__total">{formatInteger(total)} events</span>
      </div>
      <div className="mix__bar" role="img" aria-label={total === 0 ? 'No events in this window' : summary}>
        {total > 0
          ? SEVERITIES.map((s) =>
              counts[s] > 0 ? (
                <span key={s} className={`mix__seg mix__seg--${s}`} style={{ flexGrow: counts[s] }} />
              ) : null,
            )
          : null}
      </div>
      <ul className="mix__legend">
        {SEVERITIES.map((s) => (
          <li key={s} className={`mix__item mix__item--${s}`}>
            <span className="mix__dot" aria-hidden="true" />
            {LABELS[s]}
            <strong>{percent(counts[s], total)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
});
