import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ringBuffer.ts';

describe('RingBuffer', () => {
  it('stores items in chronological order until full', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    expect(buffer.size).toBe(2);
    expect(buffer.toArray()).toEqual([1, 2]);
  });

  it('overwrites the oldest item when full and returns it', () => {
    const buffer = new RingBuffer<number>(3);
    [1, 2, 3].forEach((n) => buffer.push(n));
    expect(buffer.push(4)).toBe(1);
    expect(buffer.push(5)).toBe(2);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
    expect(buffer.size).toBe(3);
  });

  it('never grows past its capacity', () => {
    const buffer = new RingBuffer<number>(100);
    for (let i = 0; i < 10_000; i += 1) buffer.push(i);
    expect(buffer.size).toBe(100);
    expect(buffer.at(0)).toBe(9_900);
    expect(buffer.newest()).toBe(9_999);
  });

  it('supports indexed access and bounds checks', () => {
    const buffer = new RingBuffer<string>(2);
    buffer.push('a');
    buffer.push('b');
    buffer.push('c');
    expect(buffer.at(0)).toBe('b');
    expect(buffer.at(1)).toBe('c');
    expect(buffer.at(2)).toBeUndefined();
    expect(buffer.at(-1)).toBeUndefined();
  });

  it('shifts the oldest item as a bounded queue', () => {
    const buffer = new RingBuffer<number>(2);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    expect(buffer.shift()).toBe(2);
    expect(buffer.shift()).toBe(3);
    expect(buffer.shift()).toBeUndefined();
    expect(buffer.size).toBe(0);
  });

  it('keeps the newest items when shrinking', () => {
    const buffer = new RingBuffer<number>(5);
    [1, 2, 3, 4, 5, 6, 7].forEach((n) => buffer.push(n));
    expect(buffer.resize(2)).toEqual([3, 4, 5]);
    expect(buffer.toArray()).toEqual([6, 7]);
    buffer.push(8);
    expect(buffer.toArray()).toEqual([7, 8]);
  });

  it('keeps everything when growing', () => {
    const buffer = new RingBuffer<number>(2);
    [1, 2, 3].forEach((n) => buffer.push(n));
    expect(buffer.resize(4)).toEqual([]);
    buffer.push(4);
    buffer.push(5);
    expect(buffer.toArray()).toEqual([2, 3, 4, 5]);
  });

  it('clears all items', () => {
    const buffer = new RingBuffer<number>(2);
    buffer.push(1);
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
  });

  it('rejects invalid capacities', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(1.5)).toThrow(RangeError);
  });
});
