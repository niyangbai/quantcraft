// @quantcraft/finmath · volsurface — a deterministic implied-volatility surface
// and the vol-only P&L of an option position under a parameterized shock.
//
// The base surface is parametric and evaluated in closed form:
//
//   sigma(t, K) = max(minVol, atm(t) + skew * m + curvature * m^2)
//   atm(t)      = atmLevel + termSlope * t     (+ optional term bump)
//   m           = ln(K / spot)
//
// Shocks perturb the parameters, so the shocked surface is another closed form
// and Delta IV = sigma'(t,K) - sigma(t,K) is exact:
//
//   skew-steepen / skew-flatten   perturb skew      -> Delta IV = ∓ magnitude * m
//   smile-up / smile-down         perturb curvature -> Delta IV = ± magnitude * m^2
//   front-vol-up / back-vol-up    add a term bump that fades with maturity
//                                 (front) or builds toward it (back)
//
// Vega is the analytic Black-Scholes-Merton vega (calls and puts agree):
//
//   d1  = (ln(S/K) + (r - q + sigma^2/2) * t) / (sigma * sqrt(t))
//   vega = S * exp(-q*t) * phi(d1) * sqrt(t)     per 1.0 unit of vol
//   vegaPerPoint = vega / 100                    per 1 vol point (0.01)
//
// The vol-only P&L of a position under a shock is then
//
//   P&L = signedQty * vegaPerPoint * DeltaIV_points
//
// Every value is deterministic and exact, so the machine always knows which
// position has the largest positive vol P&L. Import from
// "@quantcraft/finmath" or "@quantcraft/finmath/volsurface".
//
// The surface and vega are closed forms, so this module is pure TypeScript;
// the same vega a QuantLib AnalyticEuropeanEngine reports for a flat vol equal
// to the surface's blackVol at the option's own strike and expiry.

export type VolTermBump = {
  kind: "front" | "back";
  /** Size of the ATM vol bump, in decimal (0.03 = 3 pts). */
  magnitude: number;
  /** Maturity scale of the bump, in years. Default 0.25 (3 months). */
  tau?: number;
};

export type VolSurfaceParams = {
  spot: number;
  riskFreeRate: number;
  dividendYield: number;
  /** ATM implied vol at T=0, in decimal (0.22 = 22%). */
  atmLevel: number;
  /** Per-year change of ATM vol, in decimal. */
  termSlope: number;
  /** Vol per unit of ln(K/S); negative = downside skew (puts above calls). */
  skew: number;
  /** Vol per unit of ln(K/S)^2; positive = smile (wings above ATM). */
  curvature: number;
  /** Floor for any quoted vol. Default 0.02. */
  minVol?: number;
  /** Optional term-structure bump added by a front/back-end vol shock. */
  termBump?: VolTermBump;
};

export type VolShock =
  | { type: "skew-steepen"; magnitude: number }
  | { type: "skew-flatten"; magnitude: number }
  | { type: "front-vol-up"; magnitude: number }
  | { type: "back-vol-up"; magnitude: number }
  | { type: "smile-up"; magnitude: number }
  | { type: "smile-down"; magnitude: number };

export type VolOption = {
  kind: "call" | "put";
  strike: number;
  /** Years to expiry. */
  maturity: number;
  side: "long" | "short";
  qty: number;
};

export type VolPnlBreakdown = {
  ivBefore: number;
  ivAfter: number;
  /** ivAfter - ivBefore, in decimal (0.024 = 2.4 pts). */
  deltaIV: number;
  /** Delta IV in vol points (0.01 units). */
  deltaIVPoints: number;
  /** Vega per 1 vol point, per 1 contract. */
  vegaPerPoint: number;
  /** signedQty * vegaPerPoint * deltaIVPoints. */
  pnl: number;
};

export const DEFAULT_VOL_FLOOR = 0.02;
export const TERM_BUMP_TAU = 0.25;

/* ------------------------------------------------------------------ */
/* The surface                                                         */
/* ------------------------------------------------------------------ */

/** Value of the optional term bump at maturity t (0 when absent). */
export const termBumpAt = (bump: VolTermBump | undefined, t: number): number => {
  if (!bump) return 0;
  const tau = bump.tau ?? TERM_BUMP_TAU;
  return bump.kind === "front"
    ? bump.magnitude * Math.exp(-t / tau)
    : bump.magnitude * (1 - Math.exp(-t / tau));
};

/** Implied vol at (t, K) in decimal, from the parametric surface. */
export function blackVol(surface: VolSurfaceParams, t: number, strike: number): number {
  const m = Math.log(strike / surface.spot);
  const atm = surface.atmLevel + surface.termSlope * t + termBumpAt(surface.termBump, t);
  const raw = atm + surface.skew * m + surface.curvature * m * m;
  return Math.max(surface.minVol ?? DEFAULT_VOL_FLOOR, raw);
}

/**
 * Rebuild the surface under a parameterized shock. The result is another
 * VolSurfaceParams, so every quantity (blackVol, deltaIV, vega, P&L) stays a
 * closed form on the shocked surface.
 */
export function applyVolShock(surface: VolSurfaceParams, shock: VolShock): VolSurfaceParams {
  const base = { ...surface, minVol: surface.minVol ?? DEFAULT_VOL_FLOOR };
  switch (shock.type) {
    case "skew-steepen":
      return { ...base, skew: surface.skew - shock.magnitude };
    case "skew-flatten":
      return { ...base, skew: surface.skew + shock.magnitude };
    case "smile-up":
      return { ...base, curvature: surface.curvature + shock.magnitude };
    case "smile-down":
      return { ...base, curvature: surface.curvature - shock.magnitude };
    case "front-vol-up":
      return { ...base, termBump: { kind: "front", magnitude: shock.magnitude } };
    case "back-vol-up":
      return { ...base, termBump: { kind: "back", magnitude: shock.magnitude } };
  }
}

/** Delta IV (decimal) at (t, K) between the base and the shocked surface. */
export function deltaIV(base: VolSurfaceParams, shocked: VolSurfaceParams, t: number, strike: number): number {
  return blackVol(shocked, t, strike) - blackVol(base, t, strike);
}

/* ------------------------------------------------------------------ */
/* Vega and vol P&L                                                    */
/* ------------------------------------------------------------------ */

/**
 * Analytic Black-Scholes-Merton vega per 1 vol point (0.01), per 1 contract.
 * Calls and puts share the same vega.
 */
export function bsmVegaPerPoint(input: {
  spot: number;
  strike: number;
  maturity: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
}): number {
  const { spot, strike, maturity, riskFreeRate, dividendYield, volatility } = input;
  const sqrtT = Math.sqrt(maturity);
  const volSqrt = volatility * sqrtT;
  if (volSqrt <= 0 || !Number.isFinite(volatility) || volatility <= 0) return 0;
  const d1 = (Math.log(spot / strike) + (riskFreeRate - dividendYield + 0.5 * volatility * volatility) * maturity) / volSqrt;
  const phi = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return (spot * Math.exp(-dividendYield * maturity) * phi * sqrtT) / 100;
}

/** Full vol P&L breakdown of one option position under a surface shock. */
export function analyzeVolPnl(base: VolSurfaceParams, shocked: VolSurfaceParams, option: VolOption): VolPnlBreakdown {
  const ivBefore = blackVol(base, option.maturity, option.strike);
  const ivAfter = blackVol(shocked, option.maturity, option.strike);
  const delta = ivAfter - ivBefore;
  const vega = bsmVegaPerPoint({
    spot: base.spot,
    strike: option.strike,
    maturity: option.maturity,
    riskFreeRate: base.riskFreeRate,
    dividendYield: base.dividendYield,
    volatility: ivBefore,
  });
  const signedQty = option.side === "long" ? option.qty : -option.qty;
  return {
    ivBefore,
    ivAfter,
    deltaIV: delta,
    deltaIVPoints: delta * 100,
    vegaPerPoint: vega,
    pnl: signedQty * vega * delta * 100,
  };
}

