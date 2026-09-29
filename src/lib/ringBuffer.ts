/**
 * Fixed capacity circular buffer. When full, a push overwrites the oldest item, which is what gives the
 * dashboard a hard memory ceiling regardless of stream rate.
 * push, at, newest: O(1). toArray: O(n). resize: O(n).
 */
export class RingBuffer<T> {
  private items: (T | undefined)[];
  private start = 0;
  private length = 0;

  constructor(capacity: number) {
    this.items = new Array<T | undefined>(assertCapacity(capacity));
  }

  get capacity(): number {
    return this.items.length;
  }

  get size(): number {
    return this.length;
  }

  /** Returns the evicted item when the buffer was full, so callers can release anything indexed by it. */
  push(item: T): T | undefined {
    const capacity = this.items.length;
    if (this.length < capacity) {
      this.items[(this.start + this.length) % capacity] = item;
      this.length += 1;
      return undefined;
    }
    const evicted = this.items[this.start];
    this.items[this.start] = item;
    this.start = (this.start + 1) % capacity;
    return evicted;
  }

  /** Removes and returns the oldest item. */
  shift(): T | undefined {
    if (this.length === 0) return undefined;
    const item = this.items[this.start];
    this.items[this.start] = undefined;
    this.start = (this.start + 1) % this.items.length;
    this.length -= 1;
    return item;
  }

  /** Index 0 is the oldest item. */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.length) return undefined;
    return this.items[(this.start + index) % this.items.length];
  }

  newest(): T | undefined {
    return this.at(this.length - 1);
  }

  toArray(): T[] {
    const out = new Array<T>(this.length);
    for (let i = 0; i < this.length; i += 1) {
      out[i] = this.items[(this.start + i) % this.items.length] as T;
    }
    return out;
  }

  clear(): void {
    this.items = new Array<T | undefined>(this.items.length);
    this.start = 0;
    this.length = 0;
  }

  /** Keeps the newest items that fit. Returns the items dropped by shrinking, oldest first. */
  resize(capacity: number): T[] {
    const next = assertCapacity(capacity);
    const all = this.toArray();
    const keepFrom = Math.max(0, all.length - next);
    const dropped = all.slice(0, keepFrom);
    const kept = all.slice(keepFrom);
    this.items = new Array<T | undefined>(next);
    for (let i = 0; i < kept.length; i += 1) this.items[i] = kept[i];
    this.start = 0;
    this.length = kept.length;
    return dropped;
  }
}

function assertCapacity(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('RingBuffer capacity must be a positive integer');
  }
  return capacity;
}
