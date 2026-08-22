// chart.ts — shared canvas helpers for the static diagrams (payoff, curve,
// depth, risk). No React: just the palette, crisp-canvas setup, and scales.

export const CHART = {
  paper: "#fffdf8",
  deep: "#24383a",
  coral: "#ef765f",
  muted: "#778080",
  axis: "#d9ddd6",
  grid: "#e8ebe4",
  green: "#397651",
  red: "#c64e42",
  blue: "#3f6fb0",
} as const;

export const CHART_FONT = '10px "Avenir Next", "Segoe UI", Inter, sans-serif';

/** A font that scales with the canvas's rendered width but never drops below a
 * legible floor, so tick labels stay readable when a wide diagram is drawn on
 * a narrow phone screen. */
export function scaledChartFont(base: number, width: number, baseWidth: number, weight?: "bold"): string {
  const px = Math.max(9, Math.round((base * width) / baseWidth));
  return `${weight ? `${weight} ` : ""}${px}px "Avenir Next", "Segoe UI", Inter, sans-serif`;
}

/** Size the backing store for the device pixel ratio and return the context. */
export function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Linear scale mapping a numeric domain onto a pixel range. */
export const linear = (d0: number, d1: number, r0: number, r1: number) => (value: number): number =>
  r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);

/** "Nice" tick values (1/2/5 × 10^k) covering [min, max]. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((n) => n * pow).find((n) => n >= rough) ?? 10 * pow;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-6; value += step) ticks.push(value);
  return ticks;
}
