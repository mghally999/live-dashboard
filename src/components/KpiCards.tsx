import { memo } from 'react';
import { TIME_WINDOWS } from '../config.ts';
import { useLiveSelector } from '../hooks/useLiveSelector.ts';
import type { LiveSnapshot } from '../store/liveStore.ts';
import type { ConnectionStatus } from '../types/event.ts';
import { formatDecimal, formatInteger } from '../utils/helpers.ts';
import { KpiCard } from './KpiCard.tsx';
import '../styles/kpi.css';

const selectWindowStats = (s: LiveSnapshot) => s.windowStats;
const selectTotal = (s: LiveSnapshot) => s.totals.total;
const selectStatus = (s: LiveSnapshot) => s.connection.status;
const selectWindowMs = (s: LiveSnapshot) => s.filters.windowMs;

const STATUS_LABELS: Readonly<Record<ConnectionStatus, string>> = {
  connecting: 'Connecting',
  live: 'Live',
  paused: 'Paused',
  reconnecting: 'Reconnecting',
  error: 'Offline',
};

export const KpiCards = memo(function KpiCards() {
  const stats = useLiveSelector(selectWindowStats);
  const total = useLiveSelector(selectTotal);
  const status = useLiveSelector(selectStatus);
  const windowMs = useLiveSelector(selectWindowMs);
  const windowLabel = `Last ${TIME_WINDOWS.find((w) => w.ms === windowMs)?.label ?? ''}`;

  return (
    <ul className="kpis" aria-label="Key metrics">
      <KpiCard
        hero
        live={status === 'live'}
        label="Events per second"
        icon="bolt"
        value={formatDecimal(stats.perSecond)}
        hint={`${windowLabel} average, ${formatInteger(stats.lastSecond)} in the last second`}
        tone="accent"
      />
      <KpiCard label="Total events" icon="layers" value={formatInteger(total)} hint="Since the page opened" />
      <KpiCard
        label="Critical"
        icon="alert"
        value={formatInteger(stats.bySeverity.critical)}
        hint={windowLabel}
        tone="critical"
      />
      <KpiCard
        label="Warnings"
        icon="warning"
        value={formatInteger(stats.bySeverity.warning)}
        hint={windowLabel}
        tone="warning"
      />
      <KpiCard
        label="Avg latency"
        icon="clock"
        value={stats.avgMetric === null ? '-' : `${formatDecimal(stats.avgMetric)} ms`}
        hint={windowLabel}
      />
      <KpiCard label="Status" icon="signal" value={STATUS_LABELS[status]} hint="Stream connection" />
    </ul>
  );
});
