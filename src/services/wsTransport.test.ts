import { describe, expect, it } from 'vitest';
import { isAllowedSocketUrl } from './wsTransport.ts';

describe('isAllowedSocketUrl', () => {
  it('accepts wss in production', () => {
    expect(isAllowedSocketUrl('wss://stream.example.com/live', true)).toBe(true);
  });

  it('rejects plaintext ws in production but allows it in development', () => {
    expect(isAllowedSocketUrl('ws://localhost:8080', true)).toBe(false);
    expect(isAllowedSocketUrl('ws://localhost:8080', false)).toBe(true);
  });

  it('rejects other protocols and malformed urls', () => {
    expect(isAllowedSocketUrl('https://stream.example.com', false)).toBe(false);
    expect(isAllowedSocketUrl('javascript:alert(1)', false)).toBe(false);
    expect(isAllowedSocketUrl('not a url', false)).toBe(false);
  });
});
