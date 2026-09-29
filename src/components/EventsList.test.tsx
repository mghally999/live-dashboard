import { act, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEvent, renderWithStore } from '../test/renderWithStore.tsx';
import { EventsList } from './EventsList.tsx';

function liveStore() {
  const result = renderWithStore(<EventsList />);
  act(() => {
    result.store.setConnection({ status: 'live', attempt: 0, maxAttempts: 8, retryAt: null });
    result.store.flushNow();
  });
  return result;
}

// jsdom has no layout, so the virtualizer would see a zero height viewport and render no rows.
const layoutProps = ['offsetHeight', 'offsetWidth'] as const;
const originals = layoutProps.map((prop) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop));

beforeAll(() => {
  layoutProps.forEach((prop) => {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => 420 });
  });
});

afterAll(() => {
  layoutProps.forEach((prop, i) => {
    const original = originals[i];
    if (original) Object.defineProperty(HTMLElement.prototype, prop, original);
  });
});

describe('EventsList', () => {
  it('renders hostile strings as literal text without creating elements', () => {
    const { store, container } = liveStore();
    act(() => {
      store.ingest(
        makeEvent({ source: '<script>alert(1)</script>', message: '<img src=x onerror=alert(1)>' }),
      );
      store.flushNow();
    });

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows the newest event first', () => {
    const { store } = liveStore();
    act(() => {
      store.ingest(makeEvent({ message: 'older', ts: Date.now() - 1_000 }));
      store.ingest(makeEvent({ message: 'newer' }));
      store.flushNow();
    });
    const messages = screen.getAllByTitle(/older|newer/).map((el) => el.textContent);
    expect(messages).toEqual(['newer', 'older']);
  });

  it('shows an empty state when there are no events', () => {
    liveStore();
    expect(screen.getByText('No events yet')).toBeInTheDocument();
  });

  it('shows a filtered empty state when nothing matches', () => {
    const { store } = liveStore();
    act(() => {
      store.ingest(makeEvent({ severity: 'info' }));
      store.setFilters({ severities: ['critical'] });
    });
    expect(screen.getByText('No events match the current filters')).toBeInTheDocument();
  });

  it('shows a loading state while first connecting', () => {
    renderWithStore(<EventsList />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the stream');
  });
});
