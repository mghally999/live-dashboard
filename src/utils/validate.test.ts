import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH, MAX_SOURCE_LENGTH, METRIC_RANGE } from '../config.ts';
import { parseStreamMessage, sanitizeText } from './validate.ts';

const NOW = 1_700_000_000_000;

function eventFrame(payload: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'event',
    payload: {
      id: 'evt-1',
      ts: NOW,
      source: 'api-gateway',
      severity: 'info',
      metric: 42,
      message: 'ok',
      ...payload,
    },
  });
}

function parsedEvent(frame: string) {
  const result = parseStreamMessage(frame, NOW);
  if (!result.ok || result.message.type !== 'event') throw new Error('expected an event');
  return result.message.payload;
}

describe('parseStreamMessage', () => {
  it('accepts a valid event', () => {
    expect(parsedEvent(eventFrame({}))).toEqual({
      id: 'evt-1',
      ts: NOW,
      source: 'api-gateway',
      severity: 'info',
      metric: 42,
      message: 'ok',
    });
  });

  it('accepts a heartbeat', () => {
    expect(parseStreamMessage(JSON.stringify({ type: 'heartbeat', ts: NOW }), NOW)).toEqual({
      ok: true,
      message: { type: 'heartbeat', ts: NOW },
    });
  });

  it.each([
    ['non string input', 42, 'not-string'],
    ['invalid json', '{"type": "event", ', 'invalid-json'],
    ['a json array', '[1,2,3]', 'invalid-shape'],
    ['null', 'null', 'invalid-shape'],
    ['an unknown type', JSON.stringify({ type: 'exec', payload: {} }), 'invalid-shape'],
    ['a missing payload', JSON.stringify({ type: 'event' }), 'invalid-shape'],
    ['a missing field', eventFrame({ source: undefined }), 'invalid-field'],
    ['a severity outside the enum', eventFrame({ severity: 'fatal' }), 'invalid-field'],
    ['a string metric', eventFrame({ metric: 'fast' }), 'invalid-field'],
    ['an object message', eventFrame({ message: { toString: 'x' } }), 'invalid-field'],
    ['a string timestamp', eventFrame({ ts: 'yesterday' }), 'invalid-field'],
    ['a timestamp far in the future', eventFrame({ ts: NOW + 3_600_000 }), 'clock-skew'],
    ['an empty id', eventFrame({ id: '   ' }), 'invalid-field'],
    ['a heartbeat without ts', JSON.stringify({ type: 'heartbeat' }), 'invalid-field'],
  ])('rejects %s', (_label, raw, reason) => {
    expect(parseStreamMessage(raw, NOW)).toEqual({ ok: false, reason });
  });

  it('rejects oversized frames before parsing', () => {
    expect(parseStreamMessage(eventFrame({ message: 'x'.repeat(10_000) }), NOW)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('builds a new object from whitelisted fields only', () => {
    const event = parsedEvent(
      JSON.stringify({
        type: 'event',
        payload: {
          id: 'a',
          ts: NOW,
          source: 's',
          severity: 'info',
          metric: 1,
          message: 'm',
          isAdmin: true,
          __proto__: { polluted: true },
        },
      }),
    );
    expect(Object.keys(event).sort()).toEqual(['id', 'message', 'metric', 'severity', 'source', 'ts']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('clamps the metric into a sane range', () => {
    expect(parsedEvent(eventFrame({ metric: -5 })).metric).toBe(METRIC_RANGE.min);
    expect(parsedEvent(eventFrame({ metric: 1e12 })).metric).toBe(METRIC_RANGE.max);
  });

  it('truncates long strings', () => {
    const event = parsedEvent(eventFrame({ source: 's'.repeat(500), message: 'm'.repeat(1_000) }));
    expect(event.source).toHaveLength(MAX_SOURCE_LENGTH);
    expect(event.message).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('coerces primitive ids and messages to strings', () => {
    const event = parsedEvent(eventFrame({ id: 123, message: 404 }));
    expect(event.id).toBe('123');
    expect(event.message).toBe('404');
  });

  it('keeps hostile markup as inert text for the renderer to escape', () => {
    const event = parsedEvent(
      eventFrame({ source: '<script>alert(1)</script>', message: '<img src=x onerror=alert(1)>' }),
    );
    expect(event.source).toBe('<script>alert(1)</script>');
    expect(event.message).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('sanitizeText', () => {
  it('strips control and bidi override characters', () => {
    expect(sanitizeText('a\u0000b\u001Bc\u202Ed\u200Be', 50)).toBe('abcde');
  });

  it('does not split a surrogate pair when truncating', () => {
    expect(sanitizeText('ab\u{1F600}', 3)).toBe('ab');
  });

  it('rejects non primitive values', () => {
    expect(sanitizeText({}, 10)).toBeNull();
    expect(sanitizeText(null, 10)).toBeNull();
  });
});
