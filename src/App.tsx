import { useState } from 'react';
import { ConnectionBar } from './components/ConnectionBar.tsx';
import { Controls } from './components/Controls.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { EventsList } from './components/EventsList.tsx';
import { KpiCards } from './components/KpiCards.tsx';
import { LiveChart } from './components/LiveChart.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
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
      <div className="app">
        <header className="app__header">
          <div>
            <h1 className="app__title">Live Monitoring</h1>
            <p className="app__subtitle">Service latency and events in real time</p>
          </div>
          <ErrorBoundary label="connection status">
            <ConnectionBar onRetry={retry} />
          </ErrorBoundary>
        </header>

        <ErrorBoundary label="controls">
          <Controls onPause={pause} onResume={resume} />
        </ErrorBoundary>
        <ErrorBoundary label="settings">
          <SettingsPanel />
        </ErrorBoundary>

        <main className="dashboard">
          <div className="dashboard__kpis">
            <ErrorBoundary label="key metrics">
              <KpiCards />
            </ErrorBoundary>
          </div>
          <ErrorBoundary label="chart">
            <LiveChart />
          </ErrorBoundary>
          <ErrorBoundary label="events list">
            <EventsList />
          </ErrorBoundary>
        </main>
      </div>
    </LiveStoreContext>
  );
}
