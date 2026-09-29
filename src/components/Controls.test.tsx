import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createTestStore, renderWithStore } from '../test/renderWithStore.tsx';
import { Controls } from './Controls.tsx';

function setup() {
  const store = createTestStore();
  const onPause = () => { store.setPaused(true); };
  const onResume = () => { store.setPaused(false); };
  renderWithStore(<Controls onPause={onPause} onResume={onResume} />, store);
  return store;
}

describe('Controls', () => {
  it('toggles between pause and resume', async () => {
    const user = userEvent.setup();
    const store = setup();
    const button = screen.getByRole('button', { name: 'Pause' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true');
    expect(store.getSnapshot().pause.paused).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(store.getSnapshot().pause.paused).toBe(false);
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    const store = setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(store.getSnapshot().pause.paused).toBe(true);
  });

  it('toggles a severity filter', async () => {
    const user = userEvent.setup();
    const store = setup();
    await user.click(screen.getByRole('button', { name: 'Info' }));
    expect(store.getSnapshot().filters.severities).toEqual(['warning', 'critical']);
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('changes the time window', async () => {
    const user = userEvent.setup();
    const store = setup();
    await user.selectOptions(screen.getByRole('combobox'), 'Last 5m');
    expect(store.getSnapshot().filters.windowMs).toBe(300_000);
  });
});
