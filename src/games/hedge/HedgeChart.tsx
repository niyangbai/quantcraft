import { useEffect } from "react";
import { DEFAULT_GREEK_SCALES, GREEK_KEYS, GREEK_LABELS } from "@quantcraft/finmath";
import type { GreekKey, GreekRisk } from "@quantcraft/finmath";
import { CHART, linear, niceTicks, scaledChartFont, setupCanvas } from "../../ui/chart";
import { useElementWidth } from "../../hooks";

const BASE_W = 800;
const BASE_H = 300;
const PAD = { left: 56, right: 24, top: 24, bottom: 44 };

function draw(canvas: HTMLCanvasElement, before: GreekRisk, user: GreekRisk, best: GreekRisk, objectiveKeys: GreekKey[], width: number) {
  const W = width || BASE_W;
  const H = Math.max(200, Math.round((W * BASE_H) / BASE_W));
  const ctx = setupCanvas(canvas, W, H);
  ctx.fillStyle = CHART.paper;
  ctx.fillRect(0, 0, W, H);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Normalize each Greek by its tolerance so the bars are comparable.
  const groups = GREEK_KEYS.map((key) => ({
    key,
    objective: objectiveKeys.includes(key),
    before: Math.abs(before[key]) / DEFAULT_GREEK_SCALES[key],
    user: Math.abs(user[key]) / DEFAULT_GREEK_SCALES[key],
    best: Math.abs(best[key]) / DEFAULT_GREEK_SCALES[key],
  }));
  const peak = Math.max(...groups.flatMap((group) => [group.before, group.user, group.best]));
  const yMax = Math.max(1, peak) * 1.15;

  const y = linear(0, yMax, PAD.top + plotH, PAD.top);
  const groupW = plotW / groups.length;

  ctx.font = scaledChartFont(10, W, BASE_W);

  // Horizontal gridlines.
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
    ctx.fillText(tick.toFixed(1), PAD.left - 8, yy + 3);
  }

  // Axes.
  ctx.strokeStyle = CHART.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.stroke();

  // Three bars per Greek: before (coral), your hedge (blue), correct (green).
  // Non-objective Greeks are dimmed so the dealer objective reads as the target.
  const barW = Math.min(15, groupW * 0.22);
  groups.forEach((group, index) => {
    const center = PAD.left + groupW * (index + 0.5);
    const drawBar = (value: number, color: string, offset: number) => {
      if (value <= 0) return;
      ctx.fillStyle = color;
      ctx.fillRect(center + offset - barW / 2, y(value), barW, y(0) - y(value));
    };
    const beforeColor = group.objective ? CHART.coral : "rgba(239, 118, 95, 0.28)";
    const userColor = group.objective ? CHART.blue : "rgba(63, 111, 176, 0.28)";
    const bestColor = group.objective ? CHART.green : "rgba(57, 118, 81, 0.28)";
    drawBar(group.before, beforeColor, -barW * 1.15);
    drawBar(group.user, userColor, 0);
    drawBar(group.best, bestColor, barW * 1.15);

    ctx.font = scaledChartFont(10, W, BASE_W, group.objective ? "bold" : undefined);
    ctx.fillStyle = group.objective ? CHART.deep : CHART.muted;
    ctx.textAlign = "center";
    ctx.fillText(GREEK_LABELS[group.key], center, PAD.top + plotH + 18);
    if (group.objective) {
      ctx.fillStyle = CHART.coral;
      ctx.fillRect(center - 8, PAD.top + plotH + 22, 16, 2);
    }
  });

  // Axis label.
  ctx.fillStyle = CHART.muted;
  ctx.textAlign = "right";
  ctx.fillText("SCALED", PAD.left - 8, PAD.top - 6);
}

export function HedgeChart({ before, user, best, objectiveKeys }: { before: GreekRisk; user: GreekRisk; best: GreekRisk; objectiveKeys: GreekKey[] }) {
  const [ref, width] = useElementWidth<HTMLCanvasElement>(BASE_W);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas) draw(canvas, before, user, best, objectiveKeys, width);
  }, [before, user, best, objectiveKeys, width, ref]);

  return (
    <div className="hedge-chart-wrap">
      <p className="hedge-chart-label">RISK REDUCTION · |GREEK| ÷ TOLERANCE · OBJECTIVE HIGHLIGHTED</p>
      <canvas ref={ref} className="hedge-chart" aria-label="Greek risk before, your hedge, and the correct hedge" />
      <div className="hedge-chart-legend">
        <span><i className="before" /> BEFORE HEDGE</span>
        <span><i className="user" /> YOUR HEDGE</span>
        <span><i className="best" /> CORRECT HEDGE</span>
        <span className="objective"><i /> DEALER OBJECTIVE</span>
      </div>
    </div>
  );
}
