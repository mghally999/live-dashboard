/**
 * Largest Triangle Three Buckets downsampling. Keeps the first and last point, then picks from each bucket
 * the point forming the largest triangle with the previous pick and the next bucket's average, which
 * preserves peaks that a plain stride or average would flatten. O(n).
 */
export function lttb<T>(
  data: readonly T[],
  threshold: number,
  x: (point: T) => number,
  y: (point: T) => number,
): T[] {
  const length = data.length;
  if (threshold >= length || threshold < 3) return data.slice();

  const sampled: T[] = [];
  const bucketSize = (length - 2) / (threshold - 2);
  let a = 0;
  sampled.push(data[0] as T);

  for (let i = 0; i < threshold - 2; i += 1) {
    const nextStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, length);
    let avgX = 0;
    let avgY = 0;
    for (let j = nextStart; j < nextEnd; j += 1) {
      const point = data[j] as T;
      avgX += x(point);
      avgY += y(point);
    }
    const nextCount = Math.max(1, nextEnd - nextStart);
    avgX /= nextCount;
    avgY /= nextCount;

    const start = Math.floor(i * bucketSize) + 1;
    const end = Math.floor((i + 1) * bucketSize) + 1;
    const pointA = data[a] as T;
    const ax = x(pointA);
    const ay = y(pointA);

    let maxArea = -1;
    let picked = start;
    for (let j = start; j < end; j += 1) {
      const point = data[j] as T;
      const area = Math.abs((ax - avgX) * (y(point) - ay) - (ax - x(point)) * (avgY - ay));
      if (area > maxArea) {
        maxArea = area;
        picked = j;
      }
    }
    sampled.push(data[picked] as T);
    a = picked;
  }

  sampled.push(data[length - 1] as T);
  return sampled;
}
