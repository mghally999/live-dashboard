import { memo, useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { CHART_MAX_POINTS } from '../config.ts';
import { usePrefersDark } from '../hooks/useColorScheme.ts';
import { useLiveSelector } from '../hooks/useLiveSelector.ts';
import { lttb } from '../lib/lttb.ts';
import { lowerBoundByTs } from '../lib/timeSearch.ts';
import type { LiveSnapshot } from '../store/liveStore.ts';
import type { ChartPoint } from '../types/event.ts';
import { formatInteger } from '../utils/helpers.ts';
import { EmptyState } from './EmptyState.tsx';
import { Loading } from './Loading.tsx';
import '../styles/chart.css';

const CHART_HEIGHT = 280;

const selectPoints = (s: LiveSnapshot) => s.points;
const selectNow = (s: LiveSnapshot) => s.now;
const selectWindowMs = (s: LiveSnapshot) => s.filters.windowMs;
const selectConnecting = (s: LiveSnapshot) => s.connection.status === 'connecting' && s.totals.total === 0;

const pointTs = (p: ChartPoint) => p.ts;
const pointMetric = (p: ChartPoint) => p.metric;

interface ChartModel {
  readonly data: uPlot.AlignedData;
  readonly range: readonly [number, number];
  readonly visible: number;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildOptions(width: number, range: { current: readonly [number, number] }): uPlot.Options {
  const grid = { stroke: cssVar('--chart-grid'), width: 1 };
  const axis = { stroke: cssVar('--text-muted'), grid, ticks: grid };
  return {
    width,
    height: CHART_HEIGHT,
    legend: { show: false },
    cursor: { drag: { x: false, y: false } },
    scales: {
      x: { time: true, range: () => [range.current[0], range.current[1]] },
      y: { range: (_u, _min, max) => [0, Math.max(100, Math.ceil(max * 1.1))] },
    },
    axes: [axis, { ...axis, size: 56, values: (_u, ticks) => ticks.map((t) => `${t} ms`) }],
    series: [
      {},
      {
        label: 'Latency',
        stroke: cssVar('--chart-line'),
        fill: cssVar('--chart-fill'),
        width: 1.5,
        points: { show: false },
      },
    ],
  };
}

export const LiveChart = memo(function LiveChart() {
  const points = useLiveSelector(selectPoints);
  const now = useLiveSelector(selectNow);
  const windowMs = useLiveSelector(selectWindowMs);
  const connecting = useLiveSelector(selectConnecting);
  const prefersDark = usePrefersDark();

  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const rangeRef = useRef<readonly [number, number]>([0, 1]);
  const modelRef = useRef<ChartModel | null>(null);

  // Binary search for the window start, then LTTB, so the canvas never draws more than CHART_MAX_POINTS.
  const model = useMemo<ChartModel>(() => {
    const start = lowerBoundByTs(points, now - windowMs);
    const sampled = lttb(points.slice(start), CHART_MAX_POINTS, pointTs, pointMetric);
    const xs = new Array<number>(sampled.length);
    const ys = new Array<number>(sampled.length);
    for (let i = 0; i < sampled.length; i += 1) {
      const p = sampled[i] as ChartPoint;
      xs[i] = p.ts / 1000;
      ys[i] = p.metric;
    }
    return { data: [xs, ys], range: [(now - windowMs) / 1000, now / 1000], visible: points.length - start };
  }, [points, now, windowMs]);

  // Created once per color scheme; data updates go through setData, never a re-create.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const plot = new uPlot(buildOptions(container.clientWidth || 600, rangeRef), [[], []], container);
    plotRef.current = plot;
    if (modelRef.current) plot.setData(modelRef.current.data);

    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (width > 0 && width !== plot.width) plot.setSize({ width, height: CHART_HEIGHT });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, [prefersDark]);

  useEffect(() => {
    modelRef.current = model;
    rangeRef.current = model.range;
    plotRef.current?.setData(model.data);
  }, [model]);

  const isEmpty = !connecting && model.visible === 0;

  return (
    <section className="panel" aria-labelledby="chart-title">
      <header className="panel__header">
        <h2 id="chart-title" className="panel__title">
          Latency
        </h2>
        <span className="panel__meta">
          {formatInteger(model.data[0].length)} of {formatInteger(model.visible)} points drawn
        </span>
      </header>
      <div className="chart">
        <div ref={containerRef} className="chart__canvas" role="img" aria-label="Latency over time" />
        {connecting || isEmpty ? (
          <div className="chart__overlay">
            {connecting ? <Loading /> : <EmptyState title="No data in this window" hint="Waiting for events." />}
          </div>
        ) : null}
      </div>
    </section>
  );
});
