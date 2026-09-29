import { useState } from 'react';
import { Brand } from './components/Brand.tsx';
import { ConnectionBar } from './components/ConnectionBar.tsx';
import { Controls } from './components/Controls.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { EventsList } from './components/EventsList.tsx';
import { KpiCards } from './components/KpiCards.tsx';
import { LiveChart } from './components/LiveChart.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { SeverityMix } from './components/SeverityMix.tsx';
import { LiveStoreContext } from './hooks/useLiveSelector.ts';
import { useLiveStream } from './hooks/useLiveStream.ts';
import { LiveStore } from './store/liveStore.ts';
import './styles/dashboard.css';

/**
 * Layout and wiring only. App holds no live data, so it renders once and stream updates re-render only the
 * widgets that select the changed slice.
 */
export function App() {
  const [store] = useState(() => new LiveStore());
  const { pause, resume, retry } = useLiveStream(store);

  return (
    <LiveStoreContext value={store}>
      <div className="shell">
        <aside className="rail" aria-label="Stream controls">
          <Brand />
          <ErrorBoundary label="connection status">
            <ConnectionBar onRetry={retry} />
          </ErrorBoundary>
          <ErrorBoundary label="controls">
            <Controls onPause={pause} onResume={resume} />
          </ErrorBoundary>
          <ErrorBoundary label="settings">
            <SettingsPanel />
          </ErrorBoundary>
        </aside>

        <main className="main">
          <header className="hero">
            <h1 className="hero__title">
              Service health <span className="hero__accent">in real time</span>
            </h1>
            <p className="hero__subtitle">Latency, throughput and incidents across every service, as they happen.</p>
          </header>

          <ErrorBoundary label="key metrics">
            <KpiCards />
          </ErrorBoundary>
          <ErrorBoundary label="severity mix">
            <SeverityMix />
          </ErrorBoundary>

          <div className="panels">
            <ErrorBoundary label="chart">
              <LiveChart />
            </ErrorBoundary>
            <ErrorBoundary label="events list">
              <EventsList />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </LiveStoreContext>
  );
}
