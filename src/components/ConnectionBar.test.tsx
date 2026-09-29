import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithStore } from '../test/renderWithStore.tsx';
import { ConnectionBar } from './ConnectionBar.tsx';

describe('ConnectionBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the reconnecting state with a countdown and attempt count', () => {
    const { store } = renderWithStore(<ConnectionBar onRetry={vi.fn()} />);
    act(() => {
      store.setConnection({ status: 'reconnecting', attempt: 2, maxAttempts: 8, retryAt: Date.now() + 4_000 });
      store.flushNow();
    });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Connection lost. Retrying in 4s (attempt 2 of 8)');

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(status).toHaveTextContent('Retrying in 3s');
  });

  it('offers a retry button in the error state', async () => {
    vi.useRealTimers();
    const onRetry = vi.fn();
    const { store } = renderWithStore(<ConnectionBar onRetry={onRetry} />);
    act(() => {
      store.setConnection({ status: 'error', attempt: 8, maxAttempts: 8, retryAt: null });
      store.flushNow();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).not.toHaveTextContent(/http|ws:|stack/i);
  });

  it('shows counters', () => {
    const { store } = renderWithStore(<ConnectionBar onRetry={vi.fn()} />);
    act(() => {
      store.recordMalformed();
      store.flushNow();
    });
    expect(screen.getByText(/Malformed/)).toHaveTextContent('Malformed 1');
  });
});
