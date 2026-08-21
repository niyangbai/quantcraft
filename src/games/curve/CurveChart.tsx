import type { CurveNode } from "./game";

/**
 * A static before/after yield-curve chart. Blue = base curve, red = the curve
 * after the shock. Purely presentational — no interaction.
 */
export function CurveChart({ nodes }: { nodes: CurveNode[] }) {
  const W = 800;
  const H = 320;
  const padL = 56;
  const padR = 24;
  const padT = 24;
  const padB = 42;

  const years = nodes.map((node) => node.years);
  const rates = nodes.flatMap((node) => [node.baseRate, node.shockedRate]);
  const maxYears = Math.max(...years);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const span = maxRate - minRate || 0.004;
  const lo = minRate - span * 0.25;
  const hi = maxRate + span * 0.25;

  const x = (years: number): number => padL + (years / (maxYears + 2)) * (W - padL - padR);
  const y = (rate: number): number => padT + (1 - (rate - lo) / (hi - lo)) * (H - padT - padB);

  const basePoints = nodes.map((node) => `${x(node.years)},${y(node.baseRate)}`).join(" ");
  const shockedPoints = nodes.map((node) => `${x(node.years)},${y(node.shockedRate)}`).join(" ");

  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <div className="curve-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="curve-chart" role="img" aria-label="Yield curve before and after shock">
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="curve-axis" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="curve-axis" />

        {ticks.map((tick) => (
          <line key={tick} x1={padL} y1={y(tick)} x2={W - padR} y2={y(tick)} className="curve-gridline" />
        ))}

        <polyline points={basePoints} fill="none" className="curve-line base" />
        <polyline points={shockedPoints} fill="none" className="curve-line shocked" />

        {nodes.map((node) => (
          <g key={node.label}>
            <circle cx={x(node.years)} cy={y(node.baseRate)} r={4} className="curve-dot base" />
            <circle cx={x(node.years)} cy={y(node.shockedRate)} r={4} className="curve-dot shocked" />
          </g>
        ))}

        {nodes.map((node) => (
          <text key={node.label} x={x(node.years)} y={H - padB + 18} textAnchor="middle" className="curve-tick">{node.label}</text>
        ))}

        {ticks.map((tick) => (
          <text key={tick} x={padL - 8} y={y(tick) + 3} textAnchor="end" className="curve-tick">{(tick * 100).toFixed(2)}%</text>
        ))}
      </svg>
      <div className="curve-chart-legend">
        <span><i className="base" /> BASE CURVE</span>
        <span><i className="shocked" /> AFTER SHOCK</span>
      </div>
    </div>
  );
}
