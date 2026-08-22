import { useEffect, useRef } from "react";
import { CHART, CHART_FONT, linear, niceTicks, setupCanvas } from "../../ui/chart";
import type { CurveNode } from "./game";

const W = 800;
const H = 320;
const PAD = { left: 56, right: 24, top: 24, bottom: 42 };

function curve(ctx: CanvasRenderingContext2D, points: [number, number][], color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach(([px, py], index) => (index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, px: number, py: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
}

function draw(canvas: HTMLCanvasElement, nodes: CurveNode[]) {
  const ctx = setupCanvas(canvas, W, H);
  ctx.fillStyle = CHART.paper;
  ctx.fillRect(0, 0, W, H);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const xMax = Math.max(...nodes.map((node) => node.years)) + 2;
  const rates = nodes.flatMap((node) => [node.baseRate, node.shockedRate]);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const span = maxRate - minRate || 0.004;
  const lo = minRate - span * 0.25;
  const hi = maxRate + span * 0.25;

  const x = linear(0, xMax, PAD.left, PAD.left + plotW);
  const y = linear(lo, hi, PAD.top + plotH, PAD.top);

  ctx.font = CHART_FONT;

  // Horizontal gridlines + rate ticks.
  for (const tick of niceTicks(lo, hi, 4)) {
    const yy = y(tick);
    ctx.strokeStyle = CHART.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, yy);
    ctx.lineTo(PAD.left + plotW, yy);
    ctx.stroke();
    ctx.fillStyle = CHART.muted;
    ctx.textAlign = "right";
    ctx.fillText(`${(tick * 100).toFixed(2)}%`, PAD.left - 8, yy + 3);
  }

  // Axes.
  ctx.strokeStyle = CHART.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.stroke();

  // Maturity tick labels at the node positions.
  ctx.fillStyle = CHART.muted;
  ctx.textAlign = "center";
  nodes.forEach((node) => ctx.fillText(node.label, x(node.years), PAD.top + plotH + 18));

  // Dotted connectors showing the shock at each node.
  nodes.forEach((node) => {
    ctx.strokeStyle = CHART.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(node.years), y(node.baseRate));
    ctx.lineTo(x(node.years), y(node.shockedRate));
    ctx.stroke();
    ctx.setLineDash([]);
  });

  curve(ctx, nodes.map((node) => [x(node.years), y(node.baseRate)]), CHART.blue);
  curve(ctx, nodes.map((node) => [x(node.years), y(node.shockedRate)]), CHART.coral);
  nodes.forEach((node) => {
    dot(ctx, x(node.years), y(node.baseRate), CHART.blue);
    dot(ctx, x(node.years), y(node.shockedRate), CHART.coral);
  });

  // Axis labels.
  ctx.fillStyle = CHART.muted;
  ctx.textAlign = "right";
  ctx.fillText("RATE", PAD.left - 8, PAD.top - 6);
  ctx.textAlign = "left";
  ctx.fillText("MATURITY", PAD.left + plotW + 2, PAD.top + plotH + 6);
}

export function CurveChart({ nodes }: { nodes: CurveNode[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas) draw(canvas, nodes);
  }, [nodes]);

  return (
    <div className="curve-chart-wrap">
      <canvas ref={ref} className="curve-chart" aria-label="Yield curve before and after shock" />
      <div className="curve-chart-legend">
        <span><i className="base" /> BASE CURVE</span>
        <span><i className="shocked" /> AFTER SHOCK</span>
      </div>
    </div>
  );
}
