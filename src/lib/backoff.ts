export interface BackoffOptions {
  readonly baseMs: number;
  readonly factor: number;
  readonly maxMs: number;
  readonly maxAttempts: number;
}

/**
 * Exponential backoff with full jitter: a uniform delay in [0, min(max, base * factor^attempt)].
 * Full jitter spreads reconnects from many clients so a server restart is not hit by a synchronized wave.
 * O(1).
 */
export function backoffDelay(
  attempt: number,
  options: BackoffOptions,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const ceiling = Math.min(options.maxMs, options.baseMs * options.factor ** safeAttempt);
  const r = Math.min(Math.max(random(), 0), 1);
  return Math.round(ceiling * r);
}

export function canRetry(attempt: number, options: BackoffOptions): boolean {
  return attempt < options.maxAttempts;
}
