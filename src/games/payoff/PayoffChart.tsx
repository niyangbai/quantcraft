import { useEffect } from "react";
import { bookPayoff } from "@quantcraft/finmath";
import type { PayoffLeg } from "@quantcraft/finmath";
import { useElementWidth } from "../../hooks";
import { scaledChartFont } from "../../ui/chart";

// Base logical size: the diagram is drawn at the rendered width (measured via
// ResizeObserver) with this aspect ratio, so it stays crisp and legible on
// every screen instead of being CSS-scaled down from a fixed resolution.
const BASE_W = 720;
const BASE_H = 340;
const PAD = { left: 50, right: 18, top: 24, bottom: 40 };

const C = {
  paper: "#fffdf8",
  curve: "#ef765f",
  zero: "#24383a",
  grid: "#e8ebe4",
  axis: "#d9ddd6",
  label: "#778080",
  spot: "#24383a",
};

function draw(canvas: HTMLCanvasElement, legs: PayoffLeg[], spot: number | undefined, width: number) {
  const W = width || BASE_W;
  const H = Math.max(200, Math.round((W * BASE_H) / BASE_W));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // x domain: 0 up to a bit past the furthest strike/barrier (or the spot).
  const refs = legs.flatMap((leg) => [leg.strike, leg.barrier]).filter((value) => Number.isFinite(value) && value > 0);
  const maxRef = Math.max(100, ...refs, spot ?? 0);
  const xMax = Math.max(150, Math.ceil((maxRef * 1.5) / 10) * 10);

  // Sample the terminal payoff across the domain to size the y axis.
  const N = 240;
  const points: [number, number][] = [];
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i <= N; i += 1) {
    const s = (xMax * i) / N;
    const y = bookPayoff(legs, s);
    points.push([s, y]);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  yMin = Math.min(0, yMin);
  yMax = Math.max(0, yMax);
  if (yMax - yMin < 1e-9) { yMin = -1; yMax = 1; }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;

  const sx = (s: number) => PAD.left + (s / xMax) * plotW;
  const sy = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.font = scaledChartFont(10, W, BASE_W);

  // Gridlines + x tick labels.
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = C.label;
  for (const t of [0, xMax / 2, xMax]) {
    const x = sx(t);
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, PAD.top + plotH);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(t === 0 ? "0" : String(Math.round(t)), x, PAD.top + plotH + 18);
  }
  // Horizontal gridlines (skip zero; drawn emphasized below).
  for (const t of [yMin, yMax]) {
    const y = sy(t);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(t)), PAD.left - 8, y + 3);
  }

  // Zero line (emphasized).
  const y0 = sy(0);
  ctx.strokeStyle = C.zero;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD.left, y0);
  ctx.lineTo(PAD.left + plotW, y0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.zero;
  ctx.textAlign = "right";
  ctx.fillText("0", PAD.left - 8, y0 + 3);

  // Axes.
  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.stroke();

  // The payoff curve.
  ctx.strokeStyle = C.curve;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([s, y], i) => {
    const x = sx(s);
    const yy = sy(y);
    if (i === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  });
  ctx.stroke();

  // Axis labels.
  ctx.fillStyle = C.label;
  ctx.textAlign = "right";
  ctx.fillText("PAYOFF", PAD.left - 8, PAD.top - 6);
  ctx.textAlign = "left";
  ctx.fillText("S(T)", PAD.left + plotW + 2, PAD.top + plotH + 6);

  // Terminal-spot marker (only for "payoff"-type questions).
  if (spot !== undefined && spot <= xMax) {
    const x = sx(spot);
    const y = sy(bookPayoff(legs, spot));
    ctx.strokeStyle = C.spot;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.spot;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function PayoffChart({ legs, spot }: { legs: PayoffLeg[]; spot?: number }) {
  const [ref, width] = useElementWidth<HTMLCanvasElement>(BASE_W);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas) draw(canvas, legs, spot, width);
  }, [legs, spot, width, ref]);

  return (
    <section className="payoff-chart">
      <p className="payoff-chart-label">PAYOFF DIAGRAM · TERMINAL P&L vs SPOT</p>
      <canvas ref={ref} className="payoff-chart-canvas" aria-label="Terminal payoff versus spot diagram" />
    </section>
  );
}
