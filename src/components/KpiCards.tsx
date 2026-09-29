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
      <KpiCard label="Total events" value={formatInteger(total)} hint="Since the page opened" />
      <KpiCard label="Events per second" value={formatDecimal(stats.perSecond)} hint={windowLabel} tone="accent" />
      <KpiCard label="Critical" value={formatInteger(stats.bySeverity.critical)} hint={windowLabel} tone="critical" />
      <KpiCard label="Warnings" value={formatInteger(stats.bySeverity.warning)} hint={windowLabel} tone="warning" />
      <KpiCard
        label="Avg latency"
        value={stats.avgMetric === null ? '-' : `${formatDecimal(stats.avgMetric)} ms`}
        hint={windowLabel}
      />
      <KpiCard label="Status" value={STATUS_LABELS[status]} />
    </ul>
  );
});
