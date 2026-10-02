/**
 * Small pure helpers of the hand-written SVG charts (no chart library):
 * linear scales and « nice » ticks.
 */

/** Linear mapping of `[d0, d1]` onto `[r0, r1]` (a flat domain maps to the middle). */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/**
 * « Nice » ticks covering `[min, max]` (steps of 1, 2, 2.5 or 5 × 10ⁿ).
 * @param min - Smallest value.
 * @param max - Largest value.
 * @param count - Approximate number of intervals.
 * @returns Ascending ticks; the first ≤ min, the last ≥ max.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    if (min === 0) return [0, 1];
    const pad = Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}
