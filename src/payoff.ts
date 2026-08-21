// payoff.ts — pure payoff mathematics.
// This module is intentionally free of React, storage, and game state:
// every function below is a pure function of its inputs. Business rules
// (question generation, scoring, prompts) live in payoffGame.ts.

export type PayoffSide = "long" | "short";
export type PayoffOptionType = "call" | "put";
export type PayoffBarrierType = "down-in" | "up-in" | "down-out" | "up-out";

export type PayoffKind = "equity" | "forward" | "call" | "put" | "digital" | "barrier" | "bond" | "coupon";

export type PayoffLeg = {
  kind: PayoffKind;
  side: PayoffSide;
  quantity: number; // positive count of the instrument (1, 2, 3, ...)
  strike: number; // forward / call / put / digital / barrier strike
  optionType: PayoffOptionType; // digital / barrier
  cashPayoff: number; // digital cash-or-nothing payout
  faceAmount: number; // bond / coupon redemption value
  couponRate: number; // coupon bond rate in percent of face, e.g. 5
  barrier: number; // barrier level
  barrierType: PayoffBarrierType;
  barrierTouched: boolean; // scenario fact: did the spot touch the barrier during the life?
  rebate: number; // payout when a barrier leg is not active
};

export const signedQuantity = (leg: PayoffLeg): number =>
  leg.side === "long" ? leg.quantity : -leg.quantity;

export function legPayoff(leg: PayoffLeg, spot: number): number {
  const q = signedQuantity(leg);
  switch (leg.kind) {
    case "equity":
      return q * spot;
    case "forward":
      return q * (spot - leg.strike);
    case "call":
      return q * Math.max(spot - leg.strike, 0);
    case "put":
      return q * Math.max(leg.strike - spot, 0);
    case "digital": {
      const hit = leg.optionType === "call" ? spot > leg.strike : spot < leg.strike;
      return q * (hit ? leg.cashPayoff : 0);
    }
    case "bond":
      return q * leg.faceAmount;
    case "coupon":
      return q * (leg.faceAmount + (leg.faceAmount * leg.couponRate) / 100);
    case "barrier": {
      const active = leg.barrierType.includes("out") ? !leg.barrierTouched : leg.barrierTouched;
      const option = leg.optionType === "call"
        ? Math.max(spot - leg.strike, 0)
        : Math.max(leg.strike - spot, 0);
      return q * (active ? option : leg.rebate);
    }
  }
}

export const bookPayoff = (legs: PayoffLeg[], spot: number): number =>
  legs.reduce((sum, leg) => sum + legPayoff(leg, spot), 0);

/** Books made only of continuous piecewise-linear legs have well-defined extremes and breakevens. */
export const isContinuousBook = (legs: PayoffLeg[]): boolean =>
  legs.every((leg) => leg.kind !== "digital" && leg.kind !== "barrier");

/** Break points of the piecewise-linear payoff over S >= 0. */
const kinkPoints = (legs: PayoffLeg[]): number[] => {
  const points = new Set<number>([0]);
  for (const leg of legs) {
    if (leg.kind === "forward" || leg.kind === "call" || leg.kind === "put") points.add(leg.strike);
  }
  return [...points].sort((a, b) => a - b);
};

export type ProfitBound = number | "unbounded";

export type PayoffExtremes = { max: ProfitBound; min: ProfitBound };

/**
 * Maximum and minimum terminal payoff over S(T) >= 0 for a continuous book.
 * Returns undefined for books containing digital or barrier legs.
 */
export function payoffExtremes(legs: PayoffLeg[]): PayoffExtremes | undefined {
  if (!isContinuousBook(legs)) return undefined;
  const points = kinkPoints(legs);
  const last = points[points.length - 1];
  const tailSlope = bookPayoff(legs, last + 1) - bookPayoff(legs, last);
  const samples = points.map((point) => bookPayoff(legs, point));
  return {
    max: tailSlope > 0 ? "unbounded" : Math.max(...samples),
    min: tailSlope < 0 ? "unbounded" : Math.min(...samples),
  };
}

/**
 * Spots S(T) >= 0 where the terminal payoff of a continuous book equals zero
 * at the edge of a flat-zero region or crosses zero. A book whose payoff is
 * flat at zero on an interior interval (e.g. a strangle) therefore surfaces
 * both boundary points and will not produce a single-answer breakeven drill.
 */
export function breakevens(legs: PayoffLeg[]): number[] {
  if (!isContinuousBook(legs)) return [];
  const points = kinkPoints(legs);
  const roots: number[] = [];
  const pushRoot = (root: number) => {
    const value = Math.round(root * 1e6) / 1e6;
    if (Number.isFinite(value) && !roots.some((existing) => Math.abs(existing - value) < 1e-6)) roots.push(value);
  };
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const fa = bookPayoff(legs, a);
    const fb = bookPayoff(legs, b);
    if (fa === 0 && fb !== 0) pushRoot(a);
    else if (fa !== 0 && fb === 0) pushRoot(b);
    else if (fa * fb < 0) pushRoot(a - (fa * (b - a)) / (fb - fa));
  }
  const last = points[points.length - 1];
  const atLast = bookPayoff(legs, last);
  const tailSlope = bookPayoff(legs, last + 1) - atLast;
  if (atLast === 0 && tailSlope !== 0) pushRoot(last);
  else if (tailSlope !== 0) {
    const root = last - atLast / tailSlope;
    if (root > last) pushRoot(root);
  }
  return roots;
}
