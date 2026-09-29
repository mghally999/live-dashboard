import { describe, expect, it } from 'vitest';
import { backoffDelay, canRetry, type BackoffOptions } from './backoff.ts';

const options: BackoffOptions = { baseMs: 500, factor: 2, maxMs: 10_000, maxAttempts: 5 };

describe('backoffDelay', () => {
  it('grows exponentially at the top of the jitter range', () => {
    const max = () => 1;
    expect(backoffDelay(0, options, max)).toBe(500);
    expect(backoffDelay(1, options, max)).toBe(1_000);
    expect(backoffDelay(3, options, max)).toBe(4_000);
  });

  it('caps the delay at maxMs', () => {
    expect(backoffDelay(20, options, () => 1)).toBe(10_000);
  });

  it('applies full jitter deterministically with an injected random', () => {
    expect(backoffDelay(2, options, () => 0)).toBe(0);
    expect(backoffDelay(2, options, () => 0.5)).toBe(1_000);
  });

  it('clamps out of range random values and negative attempts', () => {
    expect(backoffDelay(-3, options, () => 2)).toBe(500);
    expect(backoffDelay(1, options, () => -1)).toBe(0);
  });
});

describe('canRetry', () => {
  it('stops after maxAttempts', () => {
    expect(canRetry(4, options)).toBe(true);
    expect(canRetry(5, options)).toBe(false);
  });
});
