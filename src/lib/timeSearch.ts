/**
 * Lower bound: index of the first item with ts >= target, or items.length when none.
 * Relies on items being sorted by ts, which the store guarantees. O(log n).
 */
export function lowerBoundByTs(items: readonly { readonly ts: number }[], target: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const item = items[mid];
    if (item !== undefined && item.ts < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
