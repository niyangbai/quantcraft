import { useEffect, useRef } from "react";
import { CHART, CHART_FONT, linear, niceTicks, setupCanvas } from "../../ui/chart";
import type { OrderBook } from "@quantcraft/finmath";

const W = 800;
const H = 300;
const PAD = { left: 56, right: 24, top: 24, bottom: 40 };

type Step = { price: number; size: number }[];

function stepPoints(levels: Step, x: (p: number) => number, y: (s: number) => number): [number, number][] {
  const points: [number, number][] = [];
  let cum = 0;
  for (const level of levels) {
    points.push([x(level.price), y(cum)]);
    cum += level.size;
    points.push([x(level.price), y(cum)]);
  }
  return points;
}

function fillDepth(ctx: CanvasRenderingContext2D, levels: Step, x: (p: number) => number, y: (s: number) => number, color: string) {
  const points = stepPoints(levels, x, y);
  const firstX = x(levels[0].price);
  const lastX = x(levels[levels.length - 1].price);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(firstX, y(0));
  points.forEach(([px, py]) => ctx.lineTo(px, py));
  ctx.lineTo(lastX, y(0));
  ctx.closePath();
  ctx.fill();
}

function strokeDepth(ctx: CanvasRenderingContext2D, levels: Step, x: (p: number) => number, y: (s: number) => number, color: string) {
  const points = stepPoints(levels, x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([px, py], index) => (index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
}

function draw(canvas: HTMLCanvasElement, book: OrderBook) {
  const ctx = setupCanvas(canvas, W, H);
  ctx.fillStyle = CHART.paper;
  ctx.fillRect(0, 0, W, H);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const bids = book.bids; // best-first (price descending)
  const asks = book.asks; // best-first (price ascending)

  const prices = [...bids, ...asks].map((level) => level.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pPad = Math.max(1, Math.round((maxPrice - minPrice) * 0.2));
  const pLo = minPrice - pPad;
  const pHi = maxPrice + pPad;

  const bidTotal = bids.reduce((sum, level) => sum + level.size, 0);
  const askTotal = asks.reduce((sum, level) => sum + level.size, 0);
  const yMax = Math.max(bidTotal, askTotal) * 1.15;

  const x = linear(pLo, pHi, PAD.left, PAD.left + plotW);
  const y = linear(0, yMax, PAD.top + plotH, PAD.top);

  ctx.font = CHART_FONT;

  // Horizontal gridlines + size ticks.
  for (const tick of niceTicks(0, yMax, 4)) {
    const yy = y(tick);
    ctx.strokeStyle = CHART.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, yy);
    ctx.lineTo(PAD.left + plotW, yy);
    ctx.stroke();
    ctx.fillStyle = CHART.muted;
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(tick)), PAD.left - 8, yy + 3);
  }

  // Axes.
  ctx.strokeStyle = CHART.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.stroke();

  // Depth areas + top edges (bids green, asks red).
  fillDepth(ctx, bids, x, y, "rgba(57, 118, 81, 0.16)");
  fillDepth(ctx, asks, x, y, "rgba(198, 78, 66, 0.16)");
  strokeDepth(ctx, bids, x, y, CHART.green);
  strokeDepth(ctx, asks, x, y, CHART.red);

  // Price tick labels.
  ctx.fillStyle = CHART.muted;
  ctx.textAlign = "center";
  for (const tick of niceTicks(pLo, pHi, 5)) {
    ctx.fillText((tick / 100).toFixed(2), x(tick), PAD.top + plotH + 18);
  }

  // Axis labels.
  ctx.fillStyle = CHART.muted;
  ctx.textAlign = "right";
  ctx.fillText("SIZE", PAD.left - 8, PAD.top - 6);
  ctx.textAlign = "left";
  ctx.fillText("PRICE", PAD.left + plotW + 2, PAD.top + plotH + 6);
}

export function OrderBookChart({ book }: { book: OrderBook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas) draw(canvas, book);
  }, [book]);

  return (
    <div className="orderbook-chart-wrap">
      <p className="orderbook-chart-label">MARKET DEPTH · CUMULATIVE SIZE BY PRICE</p>
      <canvas ref={ref} className="orderbook-chart" aria-label="Order book market depth" />
      <div className="orderbook-chart-legend">
        <span><i className="bid" /> BID DEPTH</span>
        <span><i className="ask" /> ASK DEPTH</span>
      </div>
    </div>
  );
}
