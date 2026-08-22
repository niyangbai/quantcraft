import { useEffect, useRef } from "react";
import { blackVol } from "@quantcraft/finmath";
import type { VolSurfaceParams } from "@quantcraft/finmath";
import { CHART, niceTicks } from "./chart";

// Logical drawing size (scaled to the container via CSS; the backing store is
// multiplied by the device pixel ratio so the surface stays crisp).
const W = 760;
const H = 460;

const FONT = '"Avenir Next", "Segoe UI", Inter, sans-serif';

// Diverging ΔIV ramp: coral = vol up, blue = vol down, neutral = no move.
const BLUE: [number, number, number] = [63, 111, 176]; // CHART.blue
const CORAL: [number, number, number] = [239, 118, 95]; // CHART.coral
const NEUTRAL: [number, number, number] = [236, 233, 226]; // #ece9e2
// The base-surface reference skeleton — a desaturated slate so it never reads
// as the "vol down" blue pole of the heatmap.
const REF_LINE = "rgba(111, 135, 150, 0.40)";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Map a ΔIV (decimal) to a diverging color, clamped to ±dMax. */
const deltaColor = (d: number, dMax: number): [number, number, number] => {
  const t = Math.max(-1, Math.min(1, d / dMax));
  const from = t < 0 ? BLUE : NEUTRAL;
  const to = t < 0 ? NEUTRAL : CORAL;
  const k = Math.abs(t);
  return [lerp(from[0], to[0], k), lerp(from[1], to[1], k), lerp(from[2], to[2], k)];
};

/** A candidate position pinned to the surface; the pin sits at its strike/expiry
 * and the label is the position body (e.g. "1× CALL"). Side is deliberately not
 * shown — the choice grid already carries it. */
export type VolSurfaceMarker = {
  label: string;
  strike: number;
  /** Years to expiry. */
  maturity: number;
};

/**
 * An interactive 3D implied-volatility surface. The shocked surface is filled
 * with a diverging ΔIV heatmap (coral = vol rose, blue = vol fell) so the
 * region the shock moved is the dominant signal — not a few-pixel gap between
 * two near-identical meshes. The base surface is overlaid as a faint slate
 * wireframe for reference, and the candidate A/B/C positions are pinned to it.
 *
 * Drag to rotate, scroll to zoom.
 */
export function VolSurface3D({
  base,
  shocked,
  markers = [],
}: {
  base: VolSurfaceParams;
  shocked: VolSurfaceParams;
  markers?: VolSurfaceMarker[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = W / 2;
    const cy = H / 2;

    // Mesh resolution and ranges. Moneyness spans the listed strikes; the
    // maturity axis runs from spot date out past the 1Y point.
    const NX = 46;
    const NY = 32;
    const mMin = -0.28;
    const mMax = 0.28;
    const tMin = 0;
    const tMax = 1.1;
    const zScale = 11;
    const spot = base.spot;
    const atm = base.atmLevel;

    const sigmaAt = (params: VolSurfaceParams, m: number, t: number): number =>
      blackVol(params, t, spot * Math.exp(m));

    const buildMesh = (params: VolSurfaceParams): number[][] => {
      const z: number[][] = [];
      for (let iy = 0; iy <= NY; iy += 1) {
        const t = tMin + ((tMax - tMin) * iy) / NY;
        const row: number[] = [];
        for (let ix = 0; ix <= NX; ix += 1) {
          const m = mMin + ((mMax - mMin) * ix) / NX;
          row.push(sigmaAt(params, m, t));
        }
        z.push(row);
      }
      return z;
    };

    const baseMesh = buildMesh(base);
    const shockedMesh = buildMesh(shocked);

    // ΔIV (shocked − base) per vertex, its max magnitude (for the color scale),
    // and the full sigma range (for the vol axis).
    let maxAbsDelta = 0;
    let lo = Infinity;
    let hi = -Infinity;
    const deltaMesh: number[][] = [];
    for (let iy = 0; iy <= NY; iy += 1) {
      const row: number[] = [];
      for (let ix = 0; ix <= NX; ix += 1) {
        const b = baseMesh[iy][ix];
        const s = shockedMesh[iy][ix];
        const d = s - b;
        row.push(d);
        if (Math.abs(d) > maxAbsDelta) maxAbsDelta = Math.abs(d);
        if (b < lo) lo = b;
        if (s < lo) lo = s;
        if (b > hi) hi = b;
        if (s > hi) hi = s;
      }
      deltaMesh.push(row);
    }
    // Floor the scale so a tiny shock still reads instead of amplifying noise.
    const dMax = Math.max(0.008, maxAbsDelta);
    const zLo = (lo - atm) * zScale;
    const zHi = (hi - atm) * zScale;

    // Camera state persists across rounds.
    let yaw = -0.65;
    let pitch = 0.55;
    let zoom = 1;

    const project = (x: number, y: number, z: number): { sx: number; sy: number; depth: number } => {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      // Pitch around X (inverse sign so higher vol renders upward).
      const y1 = y * cosP + z * sinP;
      const z1 = -y * sinP + z * cosP;

      // Yaw around Y.
      const x2 = x * cosY + z1 * sinY;
      const z2 = -x * sinY + z1 * cosY;

      const dist = 6;
      const persp = (dist * zoom) / (dist - z2);
      return { sx: cx + x2 * persp * 85, sy: cy - y1 * persp * 85, depth: z2 };
    };

    // Project a grid vertex given its sigma, using the shared moneyness/maturity.
    const projectVertex = (ix: number, iy: number, sigma: number) => {
      const m = mMin + ((mMax - mMin) * ix) / NX;
      const t = tMin + ((tMax - tMin) * iy) / NY;
      return project(m * 5, t * 2.4, (sigma - atm) * zScale);
    };

    const drawHeatmap = () => {
      type Quad = { pts: [number, number][]; depth: number; rgb: [number, number, number] };
      const quads: Quad[] = [];
      for (let iy = 0; iy < NY; iy += 1) {
        for (let ix = 0; ix < NX; ix += 1) {
          const a = projectVertex(ix, iy, shockedMesh[iy][ix]);
          const b = projectVertex(ix + 1, iy, shockedMesh[iy][ix + 1]);
          const c = projectVertex(ix + 1, iy + 1, shockedMesh[iy + 1][ix + 1]);
          const d = projectVertex(ix, iy + 1, shockedMesh[iy + 1][ix]);
          quads.push({
            pts: [[a.sx, a.sy], [b.sx, b.sy], [c.sx, c.sy], [d.sx, d.sy]],
            depth: (a.depth + b.depth + c.depth + d.depth) / 4,
            rgb: deltaColor(deltaMesh[iy][ix], dMax),
          });
        }
      }
      quads.sort((p, q) => p.depth - q.depth);
      const minDepth = quads[0].depth;
      const maxDepth = quads[quads.length - 1].depth;
      const span = maxDepth - minDepth || 1;
      for (const quad of quads) {
        // Mild depth fog: near quads read solidly, far quads recede.
        const t = (quad.depth - minDepth) / span;
        const alpha = 0.62 + (1 - t) * 0.36;
        const [r, g, b] = quad.rgb.map((v) => Math.round(v));
        ctx.beginPath();
        ctx.moveTo(quad.pts[0][0], quad.pts[0][1]);
        ctx.lineTo(quad.pts[1][0], quad.pts[1][1]);
        ctx.lineTo(quad.pts[2][0], quad.pts[2][1]);
        ctx.lineTo(quad.pts[3][0], quad.pts[3][1]);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
        // A faint same-hue facet edge so the mesh reads without a heavy grid.
        ctx.strokeStyle = `rgba(${Math.round(r * 0.8)}, ${Math.round(g * 0.8)}, ${Math.round(b * 0.8)}, 0.22)`;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
    };

    const drawBaseWireframe = () => {
      ctx.strokeStyle = REF_LINE;
      ctx.lineWidth = 0.6;
      for (let iy = 0; iy <= NY; iy += 1) {
        ctx.beginPath();
        for (let ix = 0; ix <= NX; ix += 1) {
          const p = projectVertex(ix, iy, baseMesh[iy][ix]);
          if (ix === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }
      for (let ix = 0; ix <= NX; ix += 1) {
        ctx.beginPath();
        for (let iy = 0; iy <= NY; iy += 1) {
          const p = projectVertex(ix, iy, baseMesh[iy][ix]);
          if (iy === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }
    };

    const drawAxes = () => {
      const x0 = mMin * 5;
      const x1 = mMax * 5;
      const yMax = tMax * 2.4;
      const origin = project(x0, 0, 0);

      const endpoint = (p3: [number, number, number], label: string) => {
        const q = project(p3[0], p3[1], p3[2]);
        ctx.strokeStyle = CHART.muted;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(origin.sx, origin.sy);
        ctx.lineTo(q.sx, q.sy);
        ctx.stroke();
        ctx.fillStyle = CHART.muted;
        ctx.font = `9px ${FONT}`;
        ctx.fillText(label, q.sx + 6, q.sy - 4);
      };

      // Vol axis runs through the origin down to the low-vol end.
      const vLo = project(x0, 0, zLo);
      const vHi = project(x0, 0, zHi);
      ctx.strokeStyle = CHART.muted;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(vLo.sx, vLo.sy);
      ctx.lineTo(vHi.sx, vHi.sy);
      ctx.stroke();
      ctx.fillStyle = CHART.muted;
      ctx.font = `9px ${FONT}`;
      ctx.fillText("VOL", vHi.sx + 6, vHi.sy - 4);

      endpoint([x1, 0, 0], "MONEYNESS");
      endpoint([x0, yMax, 0], "MATURITY");

      // Tick marks + numeric labels along each axis.
      const axisTicks = (
        p0: [number, number, number],
        p1: [number, number, number],
        ticks: { f: number; label: string }[],
      ) => {
        const a = project(p0[0], p0[1], p0[2]);
        const b = project(p1[0], p1[1], p1[2]);
        const ax = b.sx - a.sx;
        const ay = b.sy - a.sy;
        const len = Math.hypot(ax, ay) || 1;
        const ux = ax / len;
        const uy = ay / len;
        const px = -uy;
        const py = ux;
        ctx.fillStyle = CHART.muted;
        ctx.font = `9px ${FONT}`;
        for (const tick of ticks) {
          const sx = a.sx + ax * tick.f;
          const sy = a.sy + ay * tick.f;
          ctx.strokeStyle = "#b9bfb9";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + px * 3, sy + py * 3);
          ctx.stroke();
          ctx.textAlign = px < -0.3 ? "right" : px > 0.3 ? "left" : "center";
          ctx.textBaseline = py < -0.3 ? "bottom" : py > 0.3 ? "top" : "middle";
          ctx.fillText(tick.label, sx + px * 8, sy + py * 8);
        }
      };

      const moneynessTicks = [-0.2, -0.1, 0, 0.1, 0.2].map((m) => ({
        f: (m - mMin) / (mMax - mMin),
        label: m === 0 ? "ATM" : `${m > 0 ? "+" : ""}${Math.round(m * 100)}%`,
      }));
      const maturityTicks = [
        { t: 1 / 12, label: "1M" },
        { t: 0.25, label: "3M" },
        { t: 0.5, label: "6M" },
        { t: 1, label: "1Y" },
      ].map((e) => ({ f: e.t / tMax, label: e.label }));
      const volTicks = niceTicks(lo, hi, 4).map((s) => ({
        f: (s - lo) / (hi - lo),
        label: `${Math.round(s * 100)}%`,
      }));

      axisTicks([x0, 0, 0], [x1, 0, 0], moneynessTicks);
      axisTicks([x0, 0, 0], [x0, yMax, 0], maturityTicks);
      axisTicks([x0, 0, zLo], [x0, 0, zHi], volTicks);
    };

    const drawMarkers = () => {
      ctx.font = `bold 9px ${FONT}`;
      for (const marker of markers) {
        const m = Math.log(marker.strike / spot);
        const sigma = sigmaAt(shocked, m, marker.maturity);
        const p = project(m * 5, marker.maturity * 2.4, (sigma - atm) * zScale);

        // White halo pin marking the position's strike/expiry on the surface.
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CHART.deep;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Label pill (qty × kind), upper-right of the pin.
        const padX = 6;
        const pillW = ctx.measureText(marker.label).width + padX * 2;
        const pillH = 15;
        const bx = p.sx + 7;
        const by = p.sy - pillH - 4;
        ctx.fillStyle = CHART.deep;
        ctx.fillRect(bx, by, pillW, pillH);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(marker.label, bx + padX, by + pillH / 2 + 0.5);
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      drawHeatmap();
      drawBaseWireframe();
      drawAxes();
      drawMarkers();
    };

    render();

    // Drag to rotate, two-finger pinch to zoom, wheel for desktop trackpads.
    // Pointer Events cover both mouse and touch, so the surface is fully
    // explorable on phones (the canvas gets `touch-action: none` in CSS so a
    // drag rotates instead of scrolling the page).
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinchDist = 0;
    const pointers = new Map<number, { x: number; y: number }>();

    const onPointerDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
      } else if (pointers.size === 2) {
        dragging = false;
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1 && dragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        yaw += dx * 0.008;
        pitch = Math.max(-1.45, Math.min(1.45, pitch + dy * 0.008));
        lastX = event.clientX;
        lastY = event.clientY;
        render();
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          zoom = Math.max(0.4, Math.min(3, zoom * (dist / pinchDist)));
          render();
        }
        pinchDist = dist;
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom = Math.max(0.4, Math.min(3, zoom * Math.exp(-event.deltaY * 0.001)));
      render();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [base, shocked, markers]);

  return (
    <div className="vol-surface">
      <canvas
        ref={canvasRef}
        aria-label="Implied volatility surface, colored by the shock's change in implied volatility"
      />
      <div className="vol-surface-legend">
        <span className="vol-scale-caption">−ΔIV</span>
        <span className="vol-scale" aria-hidden />
        <span className="vol-scale-caption">+ΔIV</span>
        <span className="vol-legend-sep" aria-hidden />
        <span className="vol-ref"><i className="base" /> BASE (REF)</span>
      </div>
    </div>
  );
}
