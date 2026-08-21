// games/volatility/game.ts — business logic for the Volatility drill.
// The generator defines a parametric base surface and a parameterized shock,
// samples a listed-strike × listed-expiry vol grid from it, then hands the
// grid to QuantLib (via @quantcraft/quantlibjs): two BlackVarianceSurfaces are
// built (base and shocked), every option position is queried for IV before and
// after (blackVol) and priced for vega (AnalyticEuropeanEngine), and the vol
// P&L is qty × vega × ΔIV. The machine always knows which position has the
// largest positive vol P&L because QuantLib computed it. This module owns the
// round generation, the labels, the explanation, and the AI tutor prompt.
// No React, no storage.

import { applyVolShock, blackVol, termBumpAt } from "@quantcraft/finmath";
import type { VolPnlBreakdown, VolShock, VolSurfaceParams } from "@quantcraft/finmath";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";

export type VolatilityParams = {
  riskFreeRate?: number;
  dividendYield?: number;
};

export const volatilityParamDefaults: Required<VolatilityParams> = {
  riskFreeRate: 0.025,
  dividendYield: 0.015,
};

/** Evaluation date shared with the app's market. */
export const VOLATILITY_EVALUATION_DATE = "2025-01-02";

/** The vol grid handed to QuantLib: expiries (ISO dates) × strikes. */
export type VolGrid = {
  evaluationDate: string;
  /** ISO expiry dates, ascending, one per listed expiry. */
  expiries: string[];
  /** Listed strikes, ascending. */
  strikes: number[];
  /** Decimal Black vols, vols[expiryIndex][strikeIndex]. */
  baseVols: number[][];
  /** Decimal Black vols of the shocked surface. */
  shockedVols: number[][];
};

export type VolatilityPosition = {
  id: string;
  kind: "call" | "put";
  strike: number;
  /** Display label, e.g. "3M". */
  expiry: string;
  /** Years to expiry. */
  maturity: number;
  side: "long" | "short";
  qty: number;
};

export type VolatilityRound = {
  spot: number;
  /** Base (pre-shock) surface parameters. */
  surface: VolSurfaceParams;
  /** Surface parameters rebuilt under the shock. */
  shockedSurface: VolSurfaceParams;
  /** The grid both QuantLib surfaces were built from. */
  grid: VolGrid;
  shock: VolShock;
  shockLabel: string;
  /** Human sentence describing how the shock moves the surface. */
  shockDetail: string;
  questionText: string;
  scenarioText: string;
  positions: VolatilityPosition[];
  /** One VolPnlBreakdown per position (QuantLib-computed), indexed like positions. */
  analysis: VolPnlBreakdown[];
  answerIndex: number;
  answerText: string;
  explanation: string;
  /** Position indices sorted by vol P&L, best first. */
  rankings: number[];
};

/** Decision window: shorter on longer streaks. */
export const volatilityDurationMs = (streak: number): number => Math.max(4500, 10000 - streak * 250);

/** Winner's P&L must clear this to keep "largest positive" well-posed. */
export const VOLATILITY_MIN_WINNER_PNL = 0.02;
/** Minimum visible margin between the winner and the runner-up. */
export const VOLATILITY_MIN_GAP = 0.004;
/** Every candidate must be a "live" option: at least this much vega per point. */
export const VOLATILITY_MIN_VEGA = 0.03;

const EXPIRIES = [
  { label: "1M", maturity: 1 / 12 },
  { label: "3M", maturity: 0.25 },
  { label: "6M", maturity: 0.5 },
  { label: "1Y", maturity: 1 },
] as const;

const MONEYNESS = [-0.2, -0.1, 0, 0.1, 0.2] as const;

const EXPIRY_MONTHS: Record<string, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };
const EXPIRY_YEARS: Record<string, number> = { "1M": 1 / 12, "3M": 0.25, "6M": 0.5, "1Y": 1 };

/** ISO date of a listed expiry, by month arithmetic from the evaluation date. */
export const volSurfaceDate = (expiry: string): string => {
  const date = new Date(`${VOLATILITY_EVALUATION_DATE}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + EXPIRY_MONTHS[expiry]);
  return date.toISOString().slice(0, 10);
};

const ATM_LEVELS = [0.18, 0.22, 0.26, 0.3] as const;
const TERM_SLOPES = [0, 0.05, 0.1] as const;
const SKEWS = [-0.35, -0.5, -0.65] as const;
const CURVATURES = [0.5, 0.9, 1.3] as const;

const SKEW_SHOCK_SIZES = [0.1, 0.15, 0.2] as const;
const SMILE_SHOCK_SIZES = [0.2, 0.3, 0.4] as const;
const TERM_SHOCK_SIZES = [0.015, 0.03, 0.045] as const;

export const VOL_SHOCK_LABELS: Record<VolShock["type"], string> = {
  "skew-steepen": "SKEW STEEPEN",
  "skew-flatten": "SKEW FLATTEN",
  "front-vol-up": "FRONT-END VOL UP",
  "back-vol-up": "BACK-END VOL UP",
  "smile-up": "SMILE UP",
  "smile-down": "SMILE DOWN",
};

const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
const shuffle = <T,>(rng: () => number, items: readonly T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

export const positionBody = (position: VolatilityPosition): string =>
  `${position.qty}× ${position.kind.toUpperCase()}`;

export const positionLabel = (position: VolatilityPosition): string =>
  `${position.side.toUpperCase()} ${positionBody(position)}`;

export const positionDetail = (position: VolatilityPosition): string =>
  `K ${position.strike} · ${position.expiry}`;

export const positionText = (position: VolatilityPosition): string =>
  `${positionLabel(position)} · ${positionDetail(position)}`;

const signedPnl = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
const signedPts = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;

/* ------------------------------------------------------------------ */
/* Round generation                                                    */
/* ------------------------------------------------------------------ */

type Cell = { strike: number; maturity: number; expiry: string };

/** Strike/expiry grid cells: whole-dollar strikes around spot. */
function drawCells(rng: () => number, spot: number): Cell[] {
  const cells: Cell[] = [];
  if (rng() < 0.5) {
    // Same expiry, three moneyness levels: the surface location (strike) varies.
    const expiry = pick(rng, EXPIRIES);
    for (const m of shuffle(rng, MONEYNESS).slice(0, 3)) {
      cells.push({ strike: Math.round(spot * Math.exp(m)), maturity: expiry.maturity, expiry: expiry.label });
    }
  } else {
    // Same moneyness, three expiries: the vega (maturity) varies.
    const moneyness = pick(rng, MONEYNESS);
    for (const expiry of shuffle(rng, EXPIRIES).slice(0, 3)) {
      cells.push({ strike: Math.round(spot * Math.exp(moneyness)), maturity: expiry.maturity, expiry: expiry.label });
    }
  }
  return cells;
}

const drawShock = (rng: () => number): VolShock => {
  const type = pick(rng, Object.keys(VOL_SHOCK_LABELS) as VolShock["type"][]);
  switch (type) {
    case "skew-steepen":
    case "skew-flatten":
      return { type, magnitude: pick(rng, SKEW_SHOCK_SIZES) };
    case "smile-up":
    case "smile-down":
      return { type, magnitude: pick(rng, SMILE_SHOCK_SIZES) };
    case "front-vol-up":
    case "back-vol-up":
      return { type, magnitude: pick(rng, TERM_SHOCK_SIZES) };
  }
};

const moneynessLabel = (m: number): string => (m === 0 ? "ATM" : `${m > 0 ? "+" : ""}${Math.round(m * 100)}%`);
const signedDelta = (value: number): string => (value === 0 ? "0.0" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`);

/** How this shock moves the surface, as ΔIV (vol pts) per expiry or moneyness. */
export const describeVolShock = (shock: VolShock): string => {
  switch (shock.type) {
    case "skew-steepen":
    case "skew-flatten": {
      const sign = shock.type === "skew-steepen" ? -1 : 1;
      return MONEYNESS.map((m) => `${moneynessLabel(m)} ${signedDelta(sign * shock.magnitude * m * 100)}`).join(" · ");
    }
    case "smile-up":
    case "smile-down": {
      const sign = shock.type === "smile-up" ? 1 : -1;
      return MONEYNESS.map((m) => `${moneynessLabel(m)} ${signedDelta(sign * shock.magnitude * m * m * 100)}`).join(" · ");
    }
    case "front-vol-up":
    case "back-vol-up": {
      const kind: "front" | "back" = shock.type === "front-vol-up" ? "front" : "back";
      const bump = { kind, magnitude: shock.magnitude };
      return EXPIRIES.map((expiry) => `${expiry.label} ${signedDelta(termBumpAt(bump, expiry.maturity) * 100)}`).join(" · ");
    }
  }
};

const describeScenario = (surface: VolSurfaceParams, shock: string): string => {
  const term = surface.termSlope === 0 ? "" : surface.termSlope > 0 ? `, +${(surface.termSlope * 100).toFixed(0)} pts/yr` : `, ${(surface.termSlope * 100).toFixed(0)} pts/yr`;
  return `Spot ${surface.spot}. Base surface: ATM ${(surface.atmLevel * 100).toFixed(0)}%${term} · skew ${surface.skew.toFixed(2)} · smile ${surface.curvature.toFixed(2)}. Shock: ${shock}`;
};

/**
 * Sample the vol grid QuantLib will build its surfaces from: the listed
 * expiries × the listed strikes, evaluated from the parametric surface.
 */
export function buildVolGrid(surface: VolSurfaceParams, shockedSurface: VolSurfaceParams): VolGrid {
  const labels = ["1M", "3M", "6M", "1Y"];
  const expiries = labels.map(volSurfaceDate);
  const strikes = MONEYNESS.map((m) => Math.round(surface.spot * Math.exp(m)));
  const sample = (target: VolSurfaceParams): number[][] =>
    labels.map((label) => strikes.map((strike) => blackVol(target, EXPIRY_YEARS[label], strike)));
  return {
    evaluationDate: VOLATILITY_EVALUATION_DATE,
    expiries,
    strikes,
    baseVols: sample(surface),
    shockedVols: sample(shockedSurface),
  };
}

/**
 * Score every position through QuantLib: two BlackVarianceSurfaces are built
 * from the grid, IV before/after come from blackVol(T, K), vega comes from
 * pricing the European option against the base surface (AnalyticEuropeanEngine
 * uses the surface's local vol at the option's own strike and expiry), and the
 * vol P&L is qty × vega(per 1 vol point) × ΔIV (in points). Surfaces are
 * destroyed on the way out. Returns undefined if QuantLib rejects the inputs.
 */
function scoreViaQuantLib(
  ql: QuantLibRuntime,
  grid: VolGrid,
  spot: number,
  riskFreeRate: number,
  dividendYield: number,
  positions: VolatilityPosition[],
): VolPnlBreakdown[] | undefined {
  let baseHandle = -1;
  let shockedHandle = -1;
  try {
    baseHandle = ql.createVolSurface({ evaluationDate: grid.evaluationDate, expiries: grid.expiries, strikes: grid.strikes, vols: grid.baseVols });
    shockedHandle = ql.createVolSurface({ evaluationDate: grid.evaluationDate, expiries: grid.expiries, strikes: grid.strikes, vols: grid.shockedVols });
    return positions.map((position) => {
      const maturityDate = volSurfaceDate(position.expiry);
      const ivBefore = ql.volSurfaceBlackVol(baseHandle, maturityDate, position.strike);
      const ivAfter = ql.volSurfaceBlackVol(shockedHandle, maturityDate, position.strike);
      // QuantLib's vega is per 1.0 unit of vol; the game quotes per 1 vol point.
      const vegaPerPoint = ql.priceEuropeanUnderSurface(baseHandle, {
        evaluationDate: grid.evaluationDate,
        maturityDate,
        spot,
        strike: position.strike,
        riskFreeRate,
        dividendYield,
        type: position.kind,
      }).vega / 100;
      const delta = ivAfter - ivBefore;
      const signedQty = position.side === "long" ? position.qty : -position.qty;
      return {
        ivBefore,
        ivAfter,
        deltaIV: delta,
        deltaIVPoints: delta * 100,
        vegaPerPoint,
        pnl: signedQty * vegaPerPoint * delta * 100,
      };
    });
  } catch {
    return undefined;
  } finally {
    if (baseHandle >= 0) ql.destroyVolSurface(baseHandle);
    if (shockedHandle >= 0) ql.destroyVolSurface(shockedHandle);
  }
}

/**
 * Build one Volatility round: draw a base surface and a parameterized shock,
 * sample the grid, then let QuantLib score the three option positions as
 * qty × vega × ΔIV. The correct answer is the position with the largest
 * positive vol P&L, so the machine always knows it. Retries when the winner is
 * not clearly ahead or not positive.
 */
export function generateVolatilityRound(rng: () => number, ql: QuantLibRuntime, params: VolatilityParams = {}): VolatilityRound {
  const riskFreeRate = params.riskFreeRate ?? volatilityParamDefaults.riskFreeRate;
  const dividendYield = params.dividendYield ?? volatilityParamDefaults.dividendYield;

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const spot = 80 + Math.floor(rng() * 41); // whole dollars, 80..120
    const surface: VolSurfaceParams = {
      spot,
      riskFreeRate,
      dividendYield,
      atmLevel: pick(rng, ATM_LEVELS),
      termSlope: pick(rng, TERM_SLOPES),
      skew: pick(rng, SKEWS),
      curvature: pick(rng, CURVATURES),
    };
    const shock = drawShock(rng);
    const shockedSurface = applyVolShock(surface, shock);
    const grid = buildVolGrid(surface, shockedSurface);

    const cells = drawCells(rng, spot);
    let positions: VolatilityPosition[];
    do {
      positions = cells.map((cell, index) => ({
        id: "ABC"[index],
        kind: rng() < 0.5 ? "call" : "put",
        strike: cell.strike,
        expiry: cell.expiry,
        maturity: cell.maturity,
        side: rng() < 0.5 ? "long" : "short",
        qty: rng() < 0.5 ? 1 : 2,
      }));
    } while (
      !positions.some((p) => p.side === "long") ||
      !positions.some((p) => p.side === "short") ||
      !positions.some((p) => p.kind === "call") ||
      !positions.some((p) => p.kind === "put")
    );

    const analysis = scoreViaQuantLib(ql, grid, spot, riskFreeRate, dividendYield, positions);
    if (!analysis) continue;
    const rankings = analysis.map((_, index) => index).sort((a, b) => analysis[b].pnl - analysis[a].pnl);
    const best = rankings[0];
    const runnerUp = rankings[1];
    const gap = analysis[best].pnl - analysis[runnerUp].pnl;

    if (analysis[best].pnl < VOLATILITY_MIN_WINNER_PNL) continue;
    if (gap < Math.max(VOLATILITY_MIN_GAP, 0.15 * Math.abs(analysis[best].pnl))) continue;
    // every candidate must be a live option — no near-zero-vega dead cards
    if (!analysis.every((entry) => entry.vegaPerPoint >= VOLATILITY_MIN_VEGA)) continue;

    const shockLabel = VOL_SHOCK_LABELS[shock.type];
    const shockDetail = describeVolShock(shock);
    const questionText = "Which position has the largest positive vol P&L?";

    return {
      spot,
      surface,
      shockedSurface,
      grid,
      shock,
      shockLabel,
      shockDetail,
      questionText,
      scenarioText: describeScenario(surface, shockDetail),
      positions,
      analysis,
      answerIndex: best,
      answerText: positionText(positions[best]),
      explanation: explainVolatility(positions, analysis, rankings, shockDetail),
      rankings,
    };
  }
  throw new Error("Unable to generate a valid volatility round (retries exhausted)");
}

/* ------------------------------------------------------------------ */
/* Explanation (what the synthetic surface found)                      */
/* ------------------------------------------------------------------ */

export function explainVolatility(
  positions: VolatilityPosition[],
  analysis: VolPnlBreakdown[],
  rankings: number[],
  shockDetail: string,
): string {
  const best = rankings[0];
  const runnerUp = rankings[1];
  const bestPos = positions[best];
  const bestA = analysis[best];
  const runnerPos = positions[runnerUp];
  const runnerA = analysis[runnerUp];
  const signedQty = bestPos.side === "long" ? bestPos.qty : -bestPos.qty;

  const parts: string[] = [];
  parts.push(
    `Best ${positionText(bestPos)}: vol P&L ${signedPnl(bestA.pnl)} = ${signedQty >= 0 ? "+" : ""}${signedQty} × vega ${bestA.vegaPerPoint.toFixed(3)} × ΔIV ${signedPts(bestA.deltaIVPoints)} (IV ${(bestA.ivBefore * 100).toFixed(1)}% → ${(bestA.ivAfter * 100).toFixed(1)}%).`,
  );

  // Dominant factor: the separator is whichever of the three gaps (ΔIV, vega,
  // size) is the widest. Each branch fired only when its ratio beats the other
  // two, so "the widest gap" is factual, not rhetorical.
  const locAdv = Math.abs(bestA.deltaIVPoints) / Math.max(1e-9, Math.abs(runnerA.deltaIVPoints));
  const vegaAdv = bestA.vegaPerPoint / Math.max(1e-9, runnerA.vegaPerPoint);
  const qtyBest = bestPos.qty * (bestPos.side === "long" ? 1 : -1);
  const qtyRunner = runnerPos.qty * (runnerPos.side === "long" ? 1 : -1);
  const qtyAdv = Math.abs(qtyBest) / Math.max(1e-9, Math.abs(qtyRunner));

  if (locAdv >= 1.5 && locAdv >= vegaAdv && locAdv >= qtyAdv) {
    parts.push(`Location decided it: the ${positionDetail(bestPos)} point is where the shock moves vol the most — ΔIV ${signedPts(bestA.deltaIVPoints)} vs the runner-up's ${signedPts(runnerA.deltaIVPoints)} — the widest gap of the three factors.`);
  } else if (vegaAdv >= 1.5 && vegaAdv >= locAdv && vegaAdv >= qtyAdv) {
    parts.push(`Vega decided it: ${positionLabel(bestPos)} is ${Math.min(99, Math.round(vegaAdv))}× as vol-sensitive as the runner-up — the widest gap of the three factors — so every vol point pays more.`);
  } else if (qtyAdv >= 2 && qtyAdv >= locAdv && qtyAdv >= vegaAdv) {
    parts.push(`Size decided it: ${positionLabel(bestPos)} runs ${bestPos.qty} contracts — double the runner-up — the widest gap of the three factors.`);
  } else if (Math.sign(qtyBest) !== Math.sign(qtyRunner) && Math.sign(bestA.deltaIVPoints) === Math.sign(qtyBest)) {
    parts.push(`Side decided it: ${positionLabel(bestPos)} is ${bestPos.side} the shock while ${positionLabel(runnerPos)} is ${runnerPos.side}; the same ΔIV pays one way and costs the other.`);
  } else {
    parts.push(`No single factor dominates: ${positionLabel(bestPos)} simply combines the best ΔIV, vega, and side.`);
  }

  parts.push(shockDetail);
  parts.push(`Runner-up ${positionText(runnerPos)}: ${signedPnl(runnerA.pnl)} (vega ${runnerA.vegaPerPoint.toFixed(3)} × ΔIV ${signedPts(runnerA.deltaIVPoints)}).`);
  return parts.join(" ");
}

export function buildVolatilityPrompt(round: VolatilityRound, difficulty: string): string {
  const { spot, surface, shockLabel, shockDetail, positions, analysis, answerIndex, answerText } = round;
  const term = surface.termSlope === 0 ? "" : surface.termSlope > 0 ? `, +${(surface.termSlope * 100).toFixed(0)} pts/yr` : `, ${(surface.termSlope * 100).toFixed(0)} pts/yr`;
  return [
    `I am training as a ${difficulty} on the QuantCraft Volatility drill.`,
    `Market: spot ${spot}. Base surface: ATM ${(surface.atmLevel * 100).toFixed(0)}%${term} · skew ${surface.skew.toFixed(2)} · smile ${surface.curvature.toFixed(2)}.`,
    `Shock: ${shockLabel === shockDetail ? shockLabel : `${shockLabel} — ${shockDetail}`}`,
    `Positions: ${positions.map((position, index) => `${position.id}: ${positionText(position)} (IV ${(analysis[index].ivBefore * 100).toFixed(1)}% → ${(analysis[index].ivAfter * 100).toFixed(1)}%, vega ${analysis[index].vegaPerPoint.toFixed(3)})`).join(" | ")}.`,
    `Correct: ${answerText} (vol P&L ${signedPnl(analysis[answerIndex].pnl)}).`,
    `Working: ${round.explanation}`,
    "Calls and puts share the same vega, so the answer never depends on the option kind — only on strike, expiry, side, and size.",
    "Give a short, level-appropriate rule for reading a surface shock + position into the largest positive vol P&L instantly.",
  ].join("\n");
}



