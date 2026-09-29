import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LiveStoreContext } from '../hooks/useLiveSelector.ts';
import { LiveStore } from '../store/liveStore.ts';
import type { MonitorEvent } from '../types/event.ts';

export function createTestStore(): LiveStore {
  return new LiveStore({
    requestFrame: (cb) => setTimeout(cb, 0),
    cancelFrame: (handle) => { clearTimeout(handle); },
    isHidden: () => false,
  });
}

export function renderWithStore(ui: ReactElement, store: LiveStore = createTestStore()) {
  return { store, ...render(<LiveStoreContext value={store}>{ui}</LiveStoreContext>) };
}

let seq = 0;
export function makeEvent(overrides: Partial<MonitorEvent> = {}): MonitorEvent {
  seq += 1;
  return {
    id: `t${seq}`,
    ts: Date.now(),
    source: 'api-gateway',
    severity: 'info',
    metric: 10,
    message: 'Request served',
    ...overrides,
  };
}
