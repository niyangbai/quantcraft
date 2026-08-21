// @quantcraft/finmath · marketmaking — a synthetic market-making model.
//
// Given a fair value, the maker's inventory, and value uncertainty, every
// quoted bid/ask pair is scored by a deterministic expected-utility model
// with four explicit components:
//
//   - fill probability:   p = lambda * exp(-kappa * delta / sigma), where
//     delta is the distance of the quote from fair (ask - fair for the ask
//     side, fair - bid for the bid side). Further quotes fill less often;
//     every sigma of distance cuts the fill probability by e^kappa.
//   - spread capture:     the expected gross edge earned on fills,
//     p_sell * (ask - fair) + p_buy * (fair - bid).
//   - adverse selection:  a fraction A of fills comes from informed flow;
//     conditional on an informed fill, the value has moved through the quote
//     by sigma * Mills(z) (truncated-normal mean). Cost = p * A * sigma * m.
//   - inventory penalty:  a trade changes the position from q to q - 1
//     (sell) or q + 1 (buy), so the position's variance changes by
//     [(q-1)^2 - q^2] * sigma^2 * T or [(q+1)^2 - q^2] * sigma^2 * T. The
//     maker is risk averse, so the mean-variance score subtracts (gamma / 2)
//     times that excess variance. For a long position selling is rewarded
//     (a negative penalty — a rebate); buying is punished.
//
//   Expected utility = spread capture - adverse selection - inventory penalty.
//
// The best quote is simply the one with the highest expected utility, so the
// machine always knows the answer. Import from "@quantcraft/finmath" or
// "@quantcraft/finmath/marketmaking".

export type Quote = { bid: number; ask: number };

/**
 * Standard-normal distribution functions. The built-in default is a pure
 * Abramowitz-Stegun approximation; callers with a QuantLib runtime can pass a
 * QuantLib-backed implementation (see `analyzeQuote`/`bestQuote` below) so the
 * numbers come from QuantLib's own routines.
 */
export type NormalStats = {
  /** Standard normal CDF. */
  cdf: (x: number) => number;
  /** Standard normal PDF. */
  pdf: (x: number) => number;
};

export type MarketMakingContext = {
  fairValue: number;
  /** Signed inventory held by the maker (+ long, - short). */
  inventory: number;
  /** Per-unit value uncertainty (sigma) over the horizon. */
  uncertainty: number;
  /** Risk aversion of the mean-variance utility. Default 0.05. */
  riskAversion?: number;
  /** Max fill probability per side (lambda). Default 0.5. */
  arrival?: number;
  /** Fill sensitivity (kappa): how fast fills drop with distance. Default 2.5. */
  fillSensitivity?: number;
  /** Fraction of fills that are informed (adverse). Default 0.2. */
  adverseFraction?: number;
  /** Horizon for the inventory risk term. Default 1. */
  horizon?: number;
};

export const DEFAULT_RISK_AVERSION = 0.05;
export const DEFAULT_ARRIVAL = 0.5;
export const DEFAULT_FILL_SENSITIVITY = 2.5;
export const DEFAULT_ADVERSE_FRACTION = 0.2;
export const DEFAULT_HORIZON = 1;

export type QuoteAnalysis = {
  quote: Quote;
  /** Expected utility: the ranking score (capture - adverse - penalty). */
  utility: number;
  /** Raw expected P&L from fills, before the risk penalty. */
  expectedPnl: number;
  fillProbability: number;
  fillProbabilitySell: number;
  fillProbabilityBuy: number;
  /** Gross spread capture, weighted by fill probability. */
  expectedEdge: number;
  /** Expected cost of informed (toxic) fills. */
  adverseSelection: number;
  /** Risk cost of the position change; negative when the trade de-risks. */
  inventoryPenalty: number;
  /** Distance from fair (fair - bid). */
  bidDistance: number;
  /** Distance from fair (ask - fair). */
  askDistance: number;
};

/* ------------------------------------------------------------------ */
/* Standard normal utilities                                           */
/* ------------------------------------------------------------------ */

const erf = (x: number): number => {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-abs * abs);
  return sign * y;
};

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, ~1.5e-7). */
export const normalCdf = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

/** Standard normal PDF. */
export const normalPdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Pure-TypeScript fallback stats (Abramowitz-Stegun CDF, closed-form PDF). */
export const builtinNormalStats: NormalStats = { cdf: normalCdf, pdf: normalPdf };

/** Inverse Mills ratio E[X | X >= z] for the standard normal. */
const millsRatio = (z: number, stats: NormalStats): number => stats.pdf(z) / (1 - stats.cdf(z));

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

/**
 * Score one quote with the synthetic market model. All four components are
 * computed in closed form, so the score is deterministic and exact.
 */
export function analyzeQuote(quote: Quote, context: MarketMakingContext, stats: NormalStats = builtinNormalStats): QuoteAnalysis {
  const gamma = context.riskAversion ?? DEFAULT_RISK_AVERSION;
  const arrival = context.arrival ?? DEFAULT_ARRIVAL;
  const kappa = context.fillSensitivity ?? DEFAULT_FILL_SENSITIVITY;
  const adverseFraction = context.adverseFraction ?? DEFAULT_ADVERSE_FRACTION;
  const horizon = context.horizon ?? DEFAULT_HORIZON;
  const { fairValue, inventory: q, uncertainty: sigma } = context;
  const { bid, ask } = quote;

  const askDistance = ask - fairValue;
  const bidDistance = fairValue - bid;

  const fillProbabilitySell = arrival * Math.exp((-kappa * askDistance) / sigma);
  const fillProbabilityBuy = arrival * Math.exp((-kappa * bidDistance) / sigma);
  const fillProbability = fillProbabilitySell + fillProbabilityBuy;

  const expectedEdge = fillProbabilitySell * askDistance + fillProbabilityBuy * bidDistance;

  const adverseSell = adverseFraction * sigma * millsRatio(askDistance / sigma, stats);
  const adverseBuy = adverseFraction * sigma * millsRatio(bidDistance / sigma, stats);
  const adverseSelection = fillProbabilitySell * adverseSell + fillProbabilityBuy * adverseBuy;

  const excessVariance = (fillProbabilitySell * ((q - 1) ** 2 - q ** 2) + fillProbabilityBuy * ((q + 1) ** 2 - q ** 2)) * sigma * sigma * horizon;
  const inventoryPenalty = (gamma / 2) * excessVariance;

  const expectedPnl = expectedEdge - adverseSelection;
  const utility = expectedPnl - inventoryPenalty;

  return {
    quote,
    utility,
    expectedPnl,
    fillProbability,
    fillProbabilitySell,
    fillProbabilityBuy,
    expectedEdge,
    adverseSelection,
    inventoryPenalty,
    bidDistance,
    askDistance,
  };
}

/** Pick the candidate quote with the highest expected utility. */
export function bestQuote(candidates: Quote[], context: MarketMakingContext, stats: NormalStats = builtinNormalStats): { quote: Quote; analysis: QuoteAnalysis; rankings: QuoteAnalysis[] } {
  const rankings = candidates.map((quote) => analyzeQuote(quote, context, stats));
  rankings.sort((a, b) => b.utility - a.utility);
  return { quote: rankings[0].quote, analysis: rankings[0], rankings };
}

