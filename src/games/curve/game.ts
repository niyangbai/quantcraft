// games/curve/game.ts — business logic for the Curve Trader drill.
// Generates a base yield curve, applies a parameterized curve shock, prices
// three bond positions before and after through @quantcraft/quantlibjs, and
// scores the largest P&L. The question is always the same: which position has
// the largest P&L? No React, no storage.
//
// The reflex: (1) which part of the curve moved, (2) where is my duration,
// (3) long or short. Ground truth is QuantLib repricing (price after - price
// before), so key-rate exposure, coupon, and notional all enter exactly.

import type { CurveBondPositionInput, QuantLibRuntime } from "@quantcraft/quantlibjs";
import { drillDurationMs, pick, shuffle, tutorIntro } from "../../shared.js";

export type CurveParams = { evaluationDate?: string };

export const curveParamDefaults: Required<CurveParams> = {
  evaluationDate: "2025-01-02",
};

export type CurveNodeLabel = string;
export type CurveSide = "long" | "short";

export type CurveNode = {
  label: CurveNodeLabel;
  years: number;
  months: number;
  /** Decimal zero rate before the shock. */
  baseRate: number;
  /** Decimal zero rate after the shock. */
  shockedRate: number;
  /** shockedRate - baseRate, in basis points. */
  deltaBp: number;
};

export type CurvePosition = {
  id: "A" | "B" | "C";
  /** Display label, e.g. "LONG 10Y BOND". */
  label: string;
  /** Display detail, e.g. "100K FACE · 3.70% COUPON". */
  detail: string;
  maturityYears: number;
  side: CurveSide;
  /** Face amount (notional) in dollars. */
  notional: number;
  /** Annual coupon in decimal (e.g. 0.037), set to the node's base rate. */
  couponRate: number;
  maturityDate: string;
};

export type CurveAnalysis = {
  /** QuantLib bond NPV before the shock. */
  priceBefore: number;
  /** QuantLib bond NPV after the shock. */
  priceAfter: number;
  /** Signed P&L: + (priceAfter - priceBefore) for long, negated for short. */
  pnl: number;
  /** Parallel DV01 (positive magnitude) for the position's notional. */
  dv01: number;
  /** Basis-point move of the position's own curve node. */
  deltaYieldBp: number;
};

export type CurveRound = {
  evaluationDate: string;
  nodes: CurveNode[];
  shockType: string;
  shockLabel: string;
  shockDetail: string;
  questionText: string;
  scenarioText: string;
  positions: CurvePosition[];
  /** One CurveAnalysis per position, indexed like positions. */
  analysis: CurveAnalysis[];
  answerIndex: number;
  answerText: string;
  /** Position indices sorted by P&L, best first. */
  rankings: number[];
  explanation: string;
};

/** Decision window: shorter on longer streaks. */
export const curveDurationMs = (streak: number): number => drillDurationMs(streak);

/** Winner's P&L must clear this (dollars) to keep "largest P&L" well-posed. */
export const CURVE_MIN_WINNER_PNL = 50;
/** Minimum visible margin (dollars) between the winner and the runner-up. */
export const CURVE_MIN_GAP = 20;

/** Candidate curve nodes; each round picks three distinct, sorted maturities. */
const MATURITY_POOL: { years: number; months: number }[] = [
  { years: 1, months: 12 },
  { years: 2, months: 24 },
  { years: 3, months: 36 },
  { years: 5, months: 60 },
  { years: 7, months: 84 },
  { years: 10, months: 120 },
  { years: 20, months: 240 },
  { years: 30, months: 360 },
];

/** Base short-end zero rates (decimal). */
const BASE_LEVELS = [0.025, 0.03, 0.035] as const;
/** Upward slope, in decimal per year. */
const BASE_SLOPES_PER_YEAR = [0.0008, 0.0012, 0.0016] as const;

/** Candidate face amounts (dollars). */
const NOTIONALS = [100000, 200000, 500000] as const;

/** Shock magnitudes in basis points. */
const SHOCK_MAGNITUDES = [10, 15, 20, 25] as const;

export const CURVE_SHOCK_LABELS: Record<string, string> = {
  "parallel-up": "PARALLEL UP",
  "parallel-down": "PARALLEL DOWN",
  "front-up": "FRONT-END UP",
  "front-down": "FRONT-END DOWN",
  "back-up": "BACK-END UP",
  "back-down": "BACK-END DOWN",
  steepen: "STEEPENING",
  flatten: "FLATTENING",
  butterfly: "BUTTERFLY",
};

/** Per-node basis-point shifts as a multiple of the shock magnitude, [2Y, 5Y, 10Y]. */
const SHOCK_SHIFTS: Record<string, readonly [number, number, number]> = {
  "parallel-up": [1, 1, 1],
  "parallel-down": [-1, -1, -1],
  "front-up": [1, 0, 0],
  "front-down": [-1, 0, 0],
  "back-up": [0, 0, 1],
  "back-down": [0, 0, -1],
  steepen: [-1, 0, 1],
  flatten: [1, 0, -1],
  butterfly: [1, -1, 1],
};

/** ISO date shifted forward by `months` months from an ISO evaluation date. */
const addMonths = (iso: string, months: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

export const positionBody = (position: CurvePosition): string =>
  `${position.maturityYears}Y BOND`;

export const positionLabel = (position: CurvePosition): string =>
  `${position.side.toUpperCase()} ${positionBody(position)}`;

export const positionDetail = (position: CurvePosition): string =>
  `${Math.round(position.notional / 1000)}K FACE · ${(position.couponRate * 100).toFixed(2)}% COUPON`;

export const signedBpText = (value: number): string => `${value > 0 ? "+" : ""}${value.toFixed(0)} bp`;
const signedPnl = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(0)}`;

/* ------------------------------------------------------------------ */
/* Curve shock description                                             */
/* ------------------------------------------------------------------ */

const describeShock = (shockType: string, magnitude: number, nodes: CurveNode[]): string => {
  const [short, mid, long] = nodes.map((node) => node.label);
  switch (shockType) {
    case "parallel-up":
      return `the whole curve shifts up ${magnitude}bp.`;
    case "parallel-down":
      return `the whole curve shifts down ${magnitude}bp.`;
    case "front-up":
      return `the ${short} point sells off ${magnitude}bp while longer maturities hold.`;
    case "front-down":
      return `the ${short} point rallies ${magnitude}bp while longer maturities hold.`;
    case "back-up":
      return `the ${long} point sells off ${magnitude}bp while the front end holds.`;
    case "back-down":
      return `the ${long} point rallies ${magnitude}bp while the front end holds.`;
    case "steepen":
      return `${short} rallies ${magnitude}bp and ${long} sells off ${magnitude}bp — the curve steepens.`;
    case "flatten":
      return `${short} sells off ${magnitude}bp and ${long} rallies ${magnitude}bp — the curve flattens.`;
    case "butterfly":
      return `${short} and ${long} sell off ${magnitude}bp while ${mid} rallies ${magnitude}bp — a butterfly.`;
    default:
      return "";
  }
};

const describeCurve = (nodes: CurveNode[]): string =>
  nodes.map((node) => `${node.label} ${(node.baseRate * 100).toFixed(2)}% → ${(node.shockedRate * 100).toFixed(2)}%`).join(" · ");

/* ------------------------------------------------------------------ */
/* QuantLib scoring                                                    */
/* ------------------------------------------------------------------ */

/**
 * Price every position through QuantLib: two zero curves are built (base and
 * shocked), the positions are repriced between them in one batch call, and
 * each position's parallel DV01 comes from pricing against the base curve.
 * Signed P&L = side × (price after − price before). Returns undefined if
 * QuantLib rejects the inputs.
 */
function scoreViaQuantLib(
  ql: QuantLibRuntime,
  evaluationDate: string,
  nodeDates: string[],
  baseRates: number[],
  shockedRates: number[],
  positions: CurvePosition[],
  deltaBpByYears: Record<number, number>,
): CurveAnalysis[] | undefined {
  let baseHandle = -1;
  let shockedHandle = -1;
  try {
    baseHandle = ql.createZeroCurve({ evaluationDate, dates: nodeDates, zeroRates: baseRates });
    shockedHandle = ql.createZeroCurve({ evaluationDate, dates: nodeDates, zeroRates: shockedRates });
    const inputs: CurveBondPositionInput[] = positions.map((position) => ({
      issueDate: evaluationDate,
      maturityDate: position.maturityDate,
      settlementDays: 0,
      faceAmount: position.notional,
      couponRate: position.couponRate,
      frequency: 2,
      redemption: 100,
    }));
    const repriced = ql.repriceBondsBetweenCurves(baseHandle, shockedHandle, evaluationDate, inputs);
    return positions.map((position, index) => {
      const dv01 = ql.priceBondWithCurve(baseHandle, { evaluationDate, ...inputs[index] }).dv01;
      const side = position.side === "long" ? 1 : -1;
      return {
        priceBefore: repriced[index].before,
        priceAfter: repriced[index].after,
        pnl: side * repriced[index].pnl,
        dv01,
        deltaYieldBp: deltaBpByYears[position.maturityYears],
      };
    });
  } catch {
    return undefined;
  } finally {
    if (baseHandle >= 0) ql.destroyCurve(baseHandle);
    if (shockedHandle >= 0) ql.destroyCurve(shockedHandle);
  }
}

/* ------------------------------------------------------------------ */
/* Round generation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build one Curve round: draw a base curve and a parameterized shock, sample
 * the three bond positions (one per maturity, mixed sides, random notional),
 * then let QuantLib score the positions as side × (price after − price before).
 * The correct answer is the position with the largest P&L, so the machine
 * always knows it. Retries when the winner is not clearly ahead or not
 * positive.
 */
export function generateCurveRound(rng: () => number, ql: QuantLibRuntime, params: CurveParams = {}): CurveRound {
  const evaluationDate = params.evaluationDate ?? curveParamDefaults.evaluationDate;

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const maturities = shuffle(rng, MATURITY_POOL).slice(0, 3).sort((a, b) => a.years - b.years);

    const baseRates = [pick(rng, BASE_LEVELS), 0, 0];
    baseRates[1] = baseRates[0] + pick(rng, BASE_SLOPES_PER_YEAR) * (maturities[1].years - maturities[0].years);
    baseRates[2] = baseRates[1] + pick(rng, BASE_SLOPES_PER_YEAR) * (maturities[2].years - maturities[1].years);

    const shockType = pick(rng, Object.keys(CURVE_SHOCK_LABELS));
    const magnitude = pick(rng, SHOCK_MAGNITUDES);
    const shifts = SHOCK_SHIFTS[shockType];
    const shockedRates = baseRates.map((rate, index) => rate + (shifts[index] * magnitude) / 10000);

    const nodes: CurveNode[] = maturities.map((maturity, index) => ({
      label: `${maturity.years}Y`,
      years: maturity.years,
      months: maturity.months,
      baseRate: baseRates[index],
      shockedRate: shockedRates[index],
      deltaBp: (shockedRates[index] - baseRates[index]) * 10000,
    }));
    const deltaBpByYears: Record<number, number> = {};
    for (const node of nodes) deltaBpByYears[node.years] = node.deltaBp;

    const positions: CurvePosition[] = shuffle(rng, nodes).map((node, index) => {
      const side: CurveSide = rng() < 0.5 ? "long" : "short";
      const notional = pick(rng, NOTIONALS);
      const position = {
        id: (["A", "B", "C"] as const)[index],
        label: "",
        detail: "",
        maturityYears: node.years,
        side,
        notional,
        couponRate: node.baseRate,
        maturityDate: addMonths(evaluationDate, node.months),
      };
      return { ...position, label: positionLabel(position), detail: positionDetail(position) };
    });

    // Keep the "long or short" reflex live: at least one of each side.
    if (!positions.some((position) => position.side === "long") || !positions.some((position) => position.side === "short")) continue;

    const analysis = scoreViaQuantLib(ql, evaluationDate, nodes.map((node) => addMonths(evaluationDate, node.months)), baseRates, shockedRates, positions, deltaBpByYears);
    if (!analysis) continue;

    const rankings = analysis.map((_, index) => index).sort((a, b) => analysis[b].pnl - analysis[a].pnl);
    const best = rankings[0];
    const runnerUp = rankings[1];
    const winnerPnl = analysis[best].pnl;
    const gap = winnerPnl - analysis[runnerUp].pnl;

    if (winnerPnl < CURVE_MIN_WINNER_PNL) continue;
    if (gap < Math.max(CURVE_MIN_GAP, 0.15 * winnerPnl)) continue;

    const shockLabel = CURVE_SHOCK_LABELS[shockType];
    const shockDetail = describeShock(shockType, magnitude, nodes);

    return {
      evaluationDate,
      nodes,
      shockType,
      shockLabel,
      shockDetail,
      questionText: "Which position has the largest P&L?",
      scenarioText: `Curve: ${describeCurve(nodes)}. Shock: ${shockDetail}`,
      positions,
      analysis,
      answerIndex: best,
      answerText: positions[best].label,
      rankings,
      explanation: explainCurve(positions, analysis, rankings, shockDetail),
    };
  }
  throw new Error("Unable to generate a valid curve round (retries exhausted)");
}

/* ------------------------------------------------------------------ */
/* Explanation (what the QuantLib repricing found)                     */
/* ------------------------------------------------------------------ */

export function explainCurve(
  positions: CurvePosition[],
  analysis: CurveAnalysis[],
  rankings: number[],
  shockDetail: string,
): string {
  const best = rankings[0];
  const runnerUp = rankings[1];
  const bestPos = positions[best];
  const bestA = analysis[best];
  const runnerPos = positions[runnerUp];
  const runnerA = analysis[runnerUp];

  const parts: string[] = [];
  parts.push(
    `Best ${bestPos.label}: P&L ${signedPnl(bestA.pnl)} (${signedBpText(bestA.deltaYieldBp)} at the ${bestPos.maturityYears}Y point, DV01 ${bestA.dv01.toFixed(1)}).`,
  );

  // Dominant factor: the widest of the three gaps (location, duration, size),
  // with direction as the fallback when the winner and runner-up are on
  // opposite sides.
  const locAdv = Math.abs(bestA.deltaYieldBp) / Math.max(1e-9, Math.abs(runnerA.deltaYieldBp));
  const durAdv = bestA.dv01 / Math.max(1e-9, runnerA.dv01);
  const sizeAdv = bestPos.notional / Math.max(1e-9, runnerPos.notional);

  if (locAdv >= 1.5 && locAdv >= durAdv && locAdv >= sizeAdv) {
    parts.push(
      `Location decided it: the ${bestPos.maturityYears}Y point moved ${signedBpText(bestA.deltaYieldBp)} while the runner-up's ${runnerPos.maturityYears}Y point moved ${signedBpText(runnerA.deltaYieldBp)} — the widest gap of the three.`,
    );
  } else if (durAdv >= 1.5 && durAdv >= locAdv && durAdv >= sizeAdv) {
    parts.push(
      `Duration decided it: the ${bestPos.maturityYears}Y bond carries ${bestA.dv01.toFixed(1)} of DV01 vs the runner-up's ${runnerA.dv01.toFixed(1)} — the widest gap of the three.`,
    );
  } else if (sizeAdv >= 2 && sizeAdv >= locAdv && sizeAdv >= durAdv) {
    parts.push(
      `Size decided it: ${bestPos.label} runs ${Math.round(bestPos.notional / 1000)}K face vs the runner-up's ${Math.round(runnerPos.notional / 1000)}K — the widest gap of the three.`,
    );
  } else if (bestPos.side !== runnerPos.side) {
    parts.push(
      `Direction decided it: ${bestPos.label} is ${bestPos.side} while ${runnerPos.label} is ${runnerPos.side}; the same move pays one and costs the other.`,
    );
  } else {
    parts.push(`No single factor dominates: ${bestPos.label} simply combines the best move, duration, and size.`);
  }

  parts.push(shockDetail);
  parts.push(`Runner-up ${runnerPos.label}: P&L ${signedPnl(runnerA.pnl)}.`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* AI tutor prompt                                                     */
/* ------------------------------------------------------------------ */

export function buildCurvePrompt(round: CurveRound, difficulty: string): string {
  const { nodes, shockLabel, shockDetail, positions, analysis, answerIndex, answerText } = round;
  return [
    tutorIntro(difficulty),
    `Curve: ${nodes.map((node) => `${node.label} ${(node.baseRate * 100).toFixed(2)}% → ${(node.shockedRate * 100).toFixed(2)}%`).join(" · ")}.`,
    `Shock: ${shockLabel} — ${shockDetail}`,
    `Positions: ${positions.map((position, index) => `${position.label} (${signedBpText(analysis[index].deltaYieldBp)}, DV01 ${analysis[index].dv01.toFixed(1)})`).join(" | ")}.`,
    `Correct: ${answerText} (P&L ${signedPnl(analysis[answerIndex].pnl)}).`,
    `Reasoning: ${round.explanation}`,
    "A long bond gains when yields fall and loses when they rise; the longer the maturity, the bigger the move. Flip the sign when short. Give one short, memorable rule for reading a curve move plus a position into the largest P&L.",
  ].join("\n");
}
