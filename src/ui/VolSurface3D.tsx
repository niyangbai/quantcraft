import { useEffect, useRef } from "react";
import { blackVol } from "@quantcraft/finmath";
import type { VolSurfaceParams } from "@quantcraft/finmath";

/**
 * An interactive 3D implied-volatility surface. It renders the base surface
 * in blue and overlays the shocked surface in translucent red, so the region
 * the shock moved is visible as the red diverging from the blue.
 *
 * The heights are evaluated with the same `blackVol` used to score the round,
 * so what you see is exactly the surface that produces ΔIV and vol P&L.
 *
 * Drag to rotate, scroll to zoom.
 */
export function VolSurface3D({ base, shocked }: { base: VolSurfaceParams; shocked: VolSurfaceParams }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    // Mesh resolution and ranges. Moneyness spans the listed strikes; the
    // maturity axis runs from spot date out past the 1Y point.
    const NX = 46;
    const NY = 32;
    const mMin = -0.28;
    const mMax = 0.28;
    const tMin = 0;
    const tMax = 1.1;
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

    // World coordinates for a grid vertex (moneyness, maturity, vol).
    const vertex = (ix: number, iy: number, sigma: number): [number, number, number] => {
      const m = mMin + ((mMax - mMin) * ix) / NX;
      const t = tMin + ((tMax - tMin) * iy) / NY;
      return [m * 5, t * 2.4, (sigma - atm) * 11];
    };

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

    type Quad = { pts: [number, number][]; depth: number };

    const drawSurface = (mesh: number[][], fill: string, stroke: string) => {
      const quads: Quad[] = [];
      for (let iy = 0; iy < NY; iy += 1) {
        for (let ix = 0; ix < NX; ix += 1) {
          const a = vertex(ix, iy, mesh[iy][ix]);
          const b = vertex(ix + 1, iy, mesh[iy][ix + 1]);
          const c = vertex(ix + 1, iy + 1, mesh[iy + 1][ix + 1]);
          const d = vertex(ix, iy + 1, mesh[iy + 1][ix]);
          const pa = project(a[0], a[1], a[2]);
          const pb = project(b[0], b[1], b[2]);
          const pc = project(c[0], c[1], c[2]);
          const pd = project(d[0], d[1], d[2]);
          quads.push({
            pts: [[pa.sx, pa.sy], [pb.sx, pb.sy], [pc.sx, pc.sy], [pd.sx, pd.sy]],
            depth: (pa.depth + pb.depth + pc.depth + pd.depth) / 4,
          });
        }
      }
      quads.sort((p, q) => p.depth - q.depth);
      for (const quad of quads) {
        ctx.beginPath();
        ctx.moveTo(quad.pts[0][0], quad.pts[0][1]);
        ctx.lineTo(quad.pts[1][0], quad.pts[1][1]);
        ctx.lineTo(quad.pts[2][0], quad.pts[2][1]);
        ctx.lineTo(quad.pts[3][0], quad.pts[3][1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    };

    const drawAxes = () => {
      const x0 = mMin * 5;
      const x1 = mMax * 5;
      const yMax = tMax * 2.4;
      let lo = Infinity;
      let hi = -Infinity;
      for (const row of baseMesh) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
      for (const row of shockedMesh) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const zHi = (hi - atm) * 11;

      const o = project(x0, 0, 0);
      const seg = (p: { sx: number; sy: number }, label: string) => {
        ctx.strokeStyle = "#778080";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(o.sx, o.sy);
        ctx.lineTo(p.sx, p.sy);
        ctx.stroke();
        ctx.fillStyle = "#778080";
        ctx.font = "9px 'Avenir Next', sans-serif";
        ctx.fillText(label, p.sx + 5, p.sy - 3);
      };

      seg(project(x1, 0, 0), "MONEYNESS");
      seg(project(x0, yMax, 0), "MATURITY");
      seg(project(x0, 0, zHi), "VOL");
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      drawAxes();
      drawSurface(baseMesh, "rgba(63, 111, 176, 0.5)", "#3f6fb0");
      drawSurface(shockedMesh, "rgba(239, 118, 95, 0.42)", "#ef765f");
    };

    render();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (event: MouseEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onMove = (event: MouseEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      yaw += dx * 0.008;
      pitch = Math.max(-1.45, Math.min(1.45, pitch + dy * 0.008));
      lastX = event.clientX;
      lastY = event.clientY;
      render();
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom = Math.max(0.4, Math.min(3, zoom * Math.exp(-event.deltaY * 0.001)));
      render();
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [base, shocked]);

  return (
    <div className="vol-surface">
      <canvas ref={canvasRef} width={760} height={460} />
      <div className="vol-surface-legend">
        <span><i className="base" /> BASE SURFACE</span>
        <span><i className="shocked" /> AFTER SHOCK</span>
      </div>
    </div>
  );
}
