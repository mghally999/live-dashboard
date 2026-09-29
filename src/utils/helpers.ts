export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Parses user input into an integer within range, falling back when it is not a number. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), min, max);
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatTime(ts: number): string {
  const ms = String(Math.floor(ts % 1000)).padStart(3, '0');
  return `${timeFormat.format(ts)}.${ms}`;
}

const integerFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function formatInteger(n: number): string {
  return integerFormat.format(n);
}

export function formatDecimal(n: number): string {
  return decimalFormat.format(n);
}

export function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}
