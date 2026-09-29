import {
  MAX_CLOCK_SKEW_MS,
  MAX_ID_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_RAW_MESSAGE_LENGTH,
  MAX_SOURCE_LENGTH,
  METRIC_RANGE,
} from '../config.ts';
import { SEVERITIES, type MonitorEvent, type Severity, type StreamMessage } from '../types/event.ts';

export type InvalidReason =
  | 'not-string'
  | 'too-large'
  | 'invalid-json'
  | 'invalid-shape'
  | 'invalid-field'
  | 'clock-skew';

export type ParseResult =
  | { readonly ok: true; readonly message: StreamMessage }
  | { readonly ok: false; readonly reason: InvalidReason };

type UnknownRecord = Readonly<Record<string, unknown>>;

// C0/C1 controls plus zero width and bidi override characters, which can spoof how text reads on screen.
// Built from a string because line separator escapes inside a regex literal trip up some parsers.
const UNSAFE_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\uFEFF]', 'g');

const fail = (reason: InvalidReason): ParseResult => ({ ok: false, reason });

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Coerces primitives to text, strips unsafe characters and truncates without splitting a surrogate pair. */
export function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
  // Truncate generously before the regex so an oversized value cannot make stripping expensive.
  const cleaned = String(value).slice(0, maxLength * 2).replace(UNSAFE_CHARS, '').trim();
  let out = cleaned.slice(0, maxLength);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

function isTimestampInRange(ts: number, now: number): boolean {
  return Math.abs(ts - now) <= MAX_CLOCK_SKEW_MS;
}

/** Builds a new event from whitelisted fields only. Never spreads the raw object. */
export function toMonitorEvent(raw: unknown, now: number): MonitorEvent | InvalidReason {
  if (!isRecord(raw)) return 'invalid-shape';

  const id = sanitizeText(raw.id, MAX_ID_LENGTH);
  const source = sanitizeText(raw.source, MAX_SOURCE_LENGTH);
  const message = sanitizeText(raw.message, MAX_MESSAGE_LENGTH);
  const { ts, metric, severity } = raw;

  if (!id || !source || message === null) return 'invalid-field';
  if (!isSeverity(severity)) return 'invalid-field';
  if (!isFiniteNumber(ts) || !isFiniteNumber(metric)) return 'invalid-field';
  if (!isTimestampInRange(ts, now)) return 'clock-skew';

  return {
    id,
    ts: Math.round(ts),
    source,
    severity,
    metric: Math.min(METRIC_RANGE.max, Math.max(METRIC_RANGE.min, metric)),
    message,
  };
}

/** Entry point for every raw frame. Never throws: anything unexpected becomes a counted rejection. */
export function parseStreamMessage(raw: unknown, now: number = Date.now()): ParseResult {
  if (typeof raw !== 'string') return fail('not-string');
  // Length is checked before JSON.parse so a hostile frame cannot make parsing expensive.
  if (raw.length > MAX_RAW_MESSAGE_LENGTH) return fail('too-large');

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail('invalid-json');
  }
  if (!isRecord(data)) return fail('invalid-shape');

  switch (data.type) {
    case 'heartbeat': {
      if (!isFiniteNumber(data.ts)) return fail('invalid-field');
      return { ok: true, message: { type: 'heartbeat', ts: data.ts } };
    }
    case 'event': {
      const event = toMonitorEvent(data.payload, now);
      if (typeof event === 'string') return fail(event);
      return { ok: true, message: { type: 'event', payload: event } };
    }
    default:
      return fail('invalid-shape');
  }
}
