// games/exotic/game.ts — business logic for the Exotic drill.
// Given one market shock, which exotic position loses the most value? Each
// round draws four exotic positions (barrier, digital, Asian, worst-of, or a
// vanilla baseline), prices them before and after the shock through
// @quantcraft/quantlibjs, and the answer is the argmin P&L. No React, no storage.
//
// The reflex to drill: find the state that matters — the barrier, the digital
// strike, the running average, the weakest asset — and find the pain.

import type { QuantLibRuntime } from "@quantcraft/quantlibjs";

export type ExoticParams = { riskFreeRate?: number; dividendYield?: number };

export const exoticParamDefaults: Required<ExoticParams> = {
  riskFreeRate: 0.025,
  dividendYield: 0.015,
};

/** Shared evaluation date and horizon for every instrument in the round. */
export const EXOTIC_EVALUATION_DATE = "2025-01-02";
const MATURITY_MONTHS = 6;

export type ExoticKind = "barrier" | "digital" | "asian" | "worstof" | "autocall" | "vanilla";
export type ExoticSide = "long" | "short";
export type ExoticOptionType = "call" | "put";
export type ExoticBarrierType = "down-in" | "up-in" | "down-out" | "up-out";

export type ExoticSpec =
  | { kind: "barrier"; type: ExoticOptionType; strike: number; barrier: number; barrierType: ExoticBarrierType }
  | { kind: "digital"; type: ExoticOptionType; strike: number; cashPayoff: number }
  | { kind: "asian"; type: ExoticOptionType; strike: number; avgSoFar: number; pastFixings: number; futureFixings: number }
  | { kind: "worstof"; type: ExoticOptionType; strike: number; spot2: number; correlation: number }
  | { kind: "autocall"; barrierLevel: number; coupon: number; maturityMonths: number }
  | { kind: "vanilla"; type: ExoticOptionType; strike: number };

export type ExoticPosition = {
  id: "A" | "B" | "C" | "D";
  kind: ExoticKind;
  side: ExoticSide;
  label: string;
  detail: string;
  spec: ExoticSpec;
};

export type ExoticPnl = { priceBefore: number; priceAfter: number; pnl: number };

export type ExoticRound = {
  evaluationDate: string;
  maturityDate: string;
  baseSpot: number;
  baseVol: number;
  afterSpot: number;
  afterVol: number;
  shockLabel: string;
  shockDetail: string;
  questionText: string;
  scenarioText: string;
  positions: ExoticPosition[];
  /** One ExoticPnl per position, indexed like positions. */
  pnl: ExoticPnl[];
  answerIndex: number;
  answerText: string;
  /** Position indices sorted by P&L ascending (worst first). */
  rankings: number[];
  explanation: string;
};

/** Decision window: exotics take a little longer to read. */
export const exoticDurationMs = (streak: number): number => Math.max(5000, 11000 - streak * 250);

/** The loser must be clearly negative, with a visible margin over the runner-up. */
export const EXOTIC_MIN_LOSS = 0.5;
export const EXOTIC_MIN_GAP = 0.5;

const BASE_SPOT = 100;
const BASE_VOLS = [0.2, 0.24, 0.28] as const;
const STRIKES = [95, 100, 105] as const;
const DIGITAL_STRIKES = [90, 95, 100, 105, 110] as const;
const AVGS = [95, 100, 105] as const;
const SECOND_SPOTS = [95, 105] as const;
const CORRELATIONS = [0.3, 0.6, 0.9] as const;
const ASIAN_PAST = 6;
const ASIAN_FUTURE = 6;
const AUTOCALL_BARRIERS = [60, 70, 80] as const;
const AUTOCALL_COUPONS = [5, 8, 12] as const;
const AUTOCALL_MATURITY_MONTHS = 24;
const AUTOCALL_OBSERVATION_MONTHS = 6;
const AUTOCALL_PATHS = 20000;

type ShockTemplate = { label: string; spot: number; vol: number; detail: string };
const SHOCK_TEMPLATES: ShockTemplate[] = [
  { label: "SELLOFF", spot: 0.86, vol: 0.08, detail: "spot gaps lower and implied volatility jumps." },
  { label: "RALLY", spot: 1.14, vol: 0.03, detail: "spot rallies through resistance while volatility edges up." },
  { label: "VOL STORM", spot: 1.01, vol: 0.12, detail: "spot barely moves but implied volatility reprices sharply higher." },
  { label: "VOL CRUSH", spot: 0.99, vol: -0.07, detail: "spot is nearly unchanged and implied volatility collapses." },
];

const BARRIER_LABELS: Record<ExoticBarrierType, string> = {
  "down-in": "DOWN-AND-IN",
  "up-in": "UP-AND-IN",
  "down-out": "DOWN-AND-OUT",
  "up-out": "UP-AND-OUT",
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

const addMonths = (iso: string, months: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

const typeText = (type: ExoticOptionType): string => type.toUpperCase();

export const positionBody = (spec: ExoticSpec): string => {
  switch (spec.kind) {
    case "barrier": return `${BARRIER_LABELS[spec.barrierType]} ${typeText(spec.type)}`;
    case "digital": return `DIGITAL ${typeText(spec.type)}`;
    case "asian": return `ASIAN ${typeText(spec.type)}`;
    case "worstof": return `WORST-OF ${typeText(spec.type)}`;
    case "autocall": return "AUTOCALL";
    case "vanilla": return `VANILLA ${typeText(spec.type)}`;
  }
};

export const positionLabel = (spec: ExoticSpec): string => `LONG ${positionBody(spec)}`;

export const positionDetail = (spec: ExoticSpec): string => {
  switch (spec.kind) {
    case "barrier": return `K ${spec.strike} · BARRIER ${spec.barrier}`;
    case "digital": return `K ${spec.strike} · PAYS ${spec.cashPayoff}`;
    case "asian": return `K ${spec.strike} · AVG SO FAR ${spec.avgSoFar}`;
    case "worstof": return `K ${spec.strike} · 2ND ${spec.spot2} · ρ ${spec.correlation.toFixed(1)}`;
    case "autocall": return `${spec.coupon}% COUPON · KO ${spec.barrierLevel}%`;
    case "vanilla": return `K ${spec.strike}`;
  }
};

const signed = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

/* ------------------------------------------------------------------ */
/* Position generation                                                 */
/* ------------------------------------------------------------------ */

function drawSpec(rng: () => number, kind: ExoticKind): ExoticSpec {
  const type: ExoticOptionType = rng() < 0.5 ? "call" : "put";
  switch (kind) {
    case "barrier": {
      const strike = pick(rng, STRIKES);
      const barrierType = pick(rng, Object.keys(BARRIER_LABELS) as ExoticBarrierType[]);
      const offset = pick(rng, [10, 15, 20]);
      const barrier = barrierType.startsWith("down") ? strike - offset : strike + offset;
      return { kind, type, strike, barrier, barrierType };
    }
    case "digital":
      return { kind, type, strike: pick(rng, DIGITAL_STRIKES), cashPayoff: 10 };
    case "asian":
      return { kind, type, strike: pick(rng, STRIKES), avgSoFar: pick(rng, AVGS), pastFixings: ASIAN_PAST, futureFixings: ASIAN_FUTURE };
    case "worstof":
      return { kind, type, strike: pick(rng, STRIKES), spot2: pick(rng, SECOND_SPOTS), correlation: pick(rng, CORRELATIONS) };
    case "autocall":
      return { kind, barrierLevel: pick(rng, AUTOCALL_BARRIERS), coupon: pick(rng, AUTOCALL_COUPONS), maturityMonths: AUTOCALL_MATURITY_MONTHS };
    case "vanilla":
      return { kind, type, strike: pick(rng, STRIKES) };
  }
}

/* ------------------------------------------------------------------ */
/* QuantLib scoring                                                    */
/* ------------------------------------------------------------------ */

/** Price one exotic spec at the given spot/vol; returns its NPV. */
function priceSpec(
  ql: QuantLibRuntime,
  spec: ExoticSpec,
  spot: number,
  vol: number,
  riskFreeRate: number,
  dividendYield: number,
  evaluationDate: string,
  maturityDate: string,
): number {
  switch (spec.kind) {
    case "barrier":
      return ql.priceBarrier({
        evaluationDate, maturityDate, spot, strike: spec.strike, barrier: spec.barrier, rebate: 0,
        riskFreeRate, dividendYield, volatility: vol, type: spec.type, barrierType: spec.barrierType,
      }).value;
    case "digital":
      return ql.priceDigital({
        evaluationDate, maturityDate, spot, strike: spec.strike, riskFreeRate, dividendYield,
        volatility: vol, type: spec.type, cashPayoff: spec.cashPayoff,
      }).value;
    case "asian":
      return ql.priceAsian({
        evaluationDate, maturityDate, spot, strike: spec.strike, riskFreeRate, dividendYield,
        volatility: vol, type: spec.type, averageSoFar: spec.avgSoFar, pastFixings: spec.pastFixings, futureFixings: spec.futureFixings,
      }).value;
    case "worstof": {
      const scale = spot / BASE_SPOT;
      return ql.priceWorstOf({
        evaluationDate, maturityDate, spot1: spot, spot2: spec.spot2 * scale, riskFreeRate,
        dividendYield1: dividendYield, dividendYield2: dividendYield, volatility1: vol, volatility2: vol,
        correlation: spec.correlation, strike: spec.strike, type: spec.type,
      }).value;
    }
    case "autocall":
      return ql.priceAutocall({
        evaluationDate,
        maturityDate: addMonths(evaluationDate, spec.maturityMonths),
        spot,
        initialSpot: BASE_SPOT,
        riskFreeRate,
        dividendYield,
        volatility: vol,
        coupon: spec.coupon,
        callLevel: BASE_SPOT,
        barrierLevel: spec.barrierLevel,
        notional: BASE_SPOT,
        observationMonths: AUTOCALL_OBSERVATION_MONTHS,
        paths: AUTOCALL_PATHS,
      }).value;
    case "vanilla":
      return ql.priceEuropean({
        evaluationDate, maturityDate, spot, strike: spec.strike, riskFreeRate, dividendYield,
        volatility: vol, type: spec.type,
      }).value;
  }
}

function scorePositions(
  ql: QuantLibRuntime,
  specs: ExoticSpec[],
  baseSpot: number,
  afterSpot: number,
  baseVol: number,
  afterVol: number,
  riskFreeRate: number,
  dividendYield: number,
  evaluationDate: string,
  maturityDate: string,
): ExoticPnl[] {
  return specs.map((spec) => {
    const priceBefore = priceSpec(ql, spec, baseSpot, baseVol, riskFreeRate, dividendYield, evaluationDate, maturityDate);
    const priceAfter = priceSpec(ql, spec, afterSpot, afterVol, riskFreeRate, dividendYield, evaluationDate, maturityDate);
    return { priceBefore, priceAfter, pnl: priceAfter - priceBefore };
  });
}

/* ------------------------------------------------------------------ */
/* Round generation                                                    */
/* ------------------------------------------------------------------ */

export function generateExoticRound(rng: () => number, ql: QuantLibRuntime, params: ExoticParams = {}): ExoticRound {
  const riskFreeRate = params.riskFreeRate ?? exoticParamDefaults.riskFreeRate;
  const dividendYield = params.dividendYield ?? exoticParamDefaults.dividendYield;
  const evaluationDate = EXOTIC_EVALUATION_DATE;
  const maturityDate = addMonths(evaluationDate, MATURITY_MONTHS);
  const baseSpot = BASE_SPOT;
  const baseVol = pick(rng, BASE_VOLS);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const shock = pick(rng, SHOCK_TEMPLATES);
    const afterSpot = Number((baseSpot * (shock.spot + (rng() * 0.03 - 0.015))).toFixed(1));
    const afterVol = Math.max(0.06, Number((baseVol + shock.vol + (rng() * 0.02 - 0.01)).toFixed(4)));

    const kinds = shuffle(rng, ["barrier", "digital", "asian", "worstof", "autocall", "vanilla"] as ExoticKind[]).slice(0, 4);
    const specs = kinds.map((kind) => drawSpec(rng, kind));

    const pnl = scorePositions(ql, specs, baseSpot, afterSpot, baseVol, afterVol, riskFreeRate, dividendYield, evaluationDate, maturityDate);

    const rankings = pnl.map((_, index) => index).sort((a, b) => pnl[a].pnl - pnl[b].pnl);
    const worst = rankings[0];
    const runnerUp = rankings[1];
    const worstPnl = pnl[worst].pnl;
    const gap = pnl[runnerUp].pnl - worstPnl;

    if (worstPnl > -EXOTIC_MIN_LOSS) continue;
    if (gap < Math.max(EXOTIC_MIN_GAP, 0.2 * Math.abs(worstPnl))) continue;

    const positions: ExoticPosition[] = specs.map((spec, index) => ({
      id: (["A", "B", "C", "D"] as const)[index],
      kind: spec.kind,
      side: "long",
      label: positionLabel(spec),
      detail: positionDetail(spec),
      spec,
    }));

    return {
      evaluationDate,
      maturityDate,
      baseSpot,
      baseVol,
      afterSpot,
      afterVol,
      shockLabel: shock.label,
      shockDetail: shock.detail,
      questionText: "Which position loses the most value?",
      scenarioText: `Spot ${baseSpot} → ${afterSpot} · Vol ${(baseVol * 100).toFixed(0)}% → ${(afterVol * 100).toFixed(0)}%. ${capitalize(shock.detail)}`,
      positions,
      pnl,
      answerIndex: worst,
      answerText: positions[worst].label,
      rankings,
      explanation: explainExotic(positions, pnl, rankings, afterSpot),
    };
  }
  throw new Error("Unable to generate a valid exotic round (retries exhausted)");
}

/* ------------------------------------------------------------------ */
/* Explanation                                                         */
/* ------------------------------------------------------------------ */

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const barrierCrossed = (spec: ExoticSpec & { kind: "barrier" }, afterSpot: number): boolean =>
  spec.barrierType.startsWith("down") ? afterSpot < spec.barrier : afterSpot > spec.barrier;

function loserReason(position: ExoticPosition, afterSpot: number): string {
  const spec = position.spec;
  switch (spec.kind) {
    case "barrier": {
      if (spec.barrierType.endsWith("out")) {
        return barrierCrossed(spec, afterSpot)
          ? `the ${BARRIER_LABELS[spec.barrierType]} knocked out — spot crossed the ${spec.barrier} barrier and the position collapsed to its rebate.`
          : `the ${BARRIER_LABELS[spec.barrierType]} sits near its ${spec.barrier} barrier, so the move eats its value without paying.`;
      }
      return barrierCrossed(spec, afterSpot)
        ? `the ${BARRIER_LABELS[spec.barrierType]} knocked in, but the ${spec.type} is out of the money, so the activation is worthless.`
        : `the ${BARRIER_LABELS[spec.barrierType]} never activated — the barrier was not hit, so the option stays dead.`;
    }
    case "digital":
      return `the digital is all or nothing at K ${spec.strike}: the spot move flips it from ${spec.type === "call" ? "in" : "out"}-the-money to ${spec.type === "call" ? "out" : "in"}-the-money — a cliff, not a slope.`;
    case "asian":
      return `the running average (${spec.avgSoFar}) is sticky: the shock moves spot far more than it moves the average, so the ${spec.type}'s payoff barely reprices.`;
    case "worstof":
      return `it pays on the weaker of two assets — the second leg (${spec.spot2}) is the drag, and ρ ${spec.correlation.toFixed(1)} controls how much it pulls the basket.`;
    case "autocall":
      return `the note is short a put on its own principal — spot falls toward the ${spec.barrierLevel}% knockout, so the redemption reprices and the early-call probability drops.`;
    case "vanilla":
      return `plain linear exposure: a ${spec.type} loses directly as spot ${spec.type === "call" ? "falls" : "rises"}.`;
  }
}

export function explainExotic(
  positions: ExoticPosition[],
  pnl: ExoticPnl[],
  rankings: number[],
  afterSpot: number,
): string {
  const worst = rankings[0];
  const runnerUp = rankings[1];
  const worstPos = positions[worst];
  const worstPnl = pnl[worst];
  const runnerPnl = pnl[runnerUp];

  return [
    `Worst ${worstPos.label}: P&L ${signed(worstPnl.pnl)} (price ${worstPnl.priceBefore.toFixed(2)} → ${worstPnl.priceAfter.toFixed(2)}).`,
    `Why: ${loserReason(worstPos, afterSpot)}`,
    `Runner-up ${positions[runnerUp].label}: P&L ${signed(runnerPnl.pnl)}.`,
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/* AI tutor prompt                                                     */
/* ------------------------------------------------------------------ */

export function buildExoticPrompt(round: ExoticRound, difficulty: string): string {
  const { positions, pnl, answerIndex, answerText } = round;
  return [
    `I am training as a ${difficulty} on the QuantCraft Exotic drill.`,
    `Shock: ${round.shockLabel} — spot ${round.baseSpot} → ${round.afterSpot}, vol ${(round.baseVol * 100).toFixed(0)}% → ${(round.afterVol * 100).toFixed(0)}%.`,
    `Positions: ${positions.map((position, index) => `${position.label} (${position.detail}, P&L ${signed(pnl[index].pnl)})`).join(" | ")}.`,
    `Correct: ${answerText} (worst P&L ${signed(pnl[answerIndex].pnl)}).`,
    `Working: ${round.explanation}`,
    "Give a short, level-appropriate rule for reading a market shock into the worst exotic P&L — find the state that matters (barrier, digital strike, running average, weakest asset).",
  ].join("\n");
}
