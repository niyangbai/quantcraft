// games/make-market/game.ts — business logic for the Make Market drill.
// The scoring model lives in @quantcraft/finmath (marketmaking): every quoted
// bid/ask pair is scored by the synthetic market model (fill probability,
// spread capture, adverse selection, inventory penalty -> expected utility)
// and the machine picks the maximum. This module owns the round generation
// (fair value / inventory / uncertainty draws, candidate quotes), the labels,
// the explanation, and the AI tutor prompt. No React, no storage.

import { bestQuote, builtinNormalStats } from "@quantcraft/finmath";
import type { MarketMakingContext, NormalStats, Quote, QuoteAnalysis } from "@quantcraft/finmath";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { drillDurationMs, pick, shuffle, tutorIntro } from "../../shared.js";

export type MakeMarketParams = {
  riskAversion?: number;
  arrival?: number;
  fillSensitivity?: number;
  adverseFraction?: number;
};

export const makeMarketParamDefaults: Required<MakeMarketParams> = {
  riskAversion: 0.2,
  arrival: 0.5,
  fillSensitivity: 2.5,
  adverseFraction: 0.2,
};

export type MakeMarketChoice = {
  quote: Quote;
  label: string;
  detail: string;
};

export type MakeMarketRound = {
  fairValue: number;
  inventory: number;
  uncertainty: number;
  params: MakeMarketParams;
  questionText: string;
  scenarioText: string;
  choices: MakeMarketChoice[];
  answerIndex: number;
  answerText: string;
  analysis: QuoteAnalysis;
  runnerUp: QuoteAnalysis;
  rankings: QuoteAnalysis[];
  explanation: string;
};

/** Decision window: shorter on longer streaks. */
export const makeMarketDurationMs = (streak: number): number => drillDurationMs(streak);

/** Signed tick offsets from fair: [bid, ask]. Ask < |bid| leans to sell. */
const TEMPLATES: ReadonlyArray<readonly [number, number]> = [
  [-3, 3],   // tight symmetric
  [-5, 5],   // symmetric
  [-7, 7],   // wide symmetric
  [-3, 7],   // buy-lean (aggressive bid)
  [-2, 8],   // strong buy-lean
  [-4, 6],   // slight buy-lean
  [-7, 3],   // sell-lean (aggressive ask)
  [-8, 2],   // strong sell-lean
  [-6, 4],   // slight sell-lean
];

const UNCERTAINTIES = [0.05, 0.1, 0.15, 0.2, 0.25];
const TIE_EPSILON = 1e-9;

const quoteLabel = (quote: Quote): string => `${quote.bid.toFixed(2)} / ${quote.ask.toFixed(2)}`;
const spreadText = (quote: Quote): string => (quote.ask - quote.bid).toFixed(2);

/**
 * Build one Make Market round: draw fair value, inventory and uncertainty,
 * then score four candidate quotes with the synthetic market model. The
 * correct answer is the quote with the highest expected utility, so the
 * machine always knows it. Retries the candidate draw when two quotes are
 * numerically tied so the answer is unambiguous.
 *
 * When a QuantLib runtime is available its CumulativeNormalDistribution /
 * NormalDistribution routines back the model's standard-normal stats;
 * otherwise the pure-TypeScript Abramowitz-Stegun fallback is used.
 */
export function generateMakeMarketRound(rng: () => number, ql?: QuantLibRuntime, params: MakeMarketParams = {}): MakeMarketRound {
  const stats: NormalStats = ql
    ? { cdf: (x) => ql.normalCdf(x), pdf: (x) => ql.normalPdf(x) }
    : builtinNormalStats;
  const fairValue = 80 + Math.floor(rng() * 41); // whole dollars, 80..120
  const magnitude = 2 * (1 + Math.floor(rng() * 8)); // 2..16
  const inventory = rng() < 0.5 ? magnitude : -magnitude;
  const uncertainty = pick(rng, UNCERTAINTIES);

  const context: MarketMakingContext = { fairValue, inventory, uncertainty, ...makeMarketParamDefaults, ...params };
  const roundParams: MakeMarketParams = { ...makeMarketParamDefaults, ...params };
  const templates = shuffle(rng, TEMPLATES);

  let best: { quote: Quote; analysis: QuoteAnalysis; rankings: QuoteAnalysis[] } | undefined;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const chosen = shuffle(rng, templates).slice(0, 4);
    const quotes = chosen.map(([bidTick, askTick]) => ({ bid: fairValue + bidTick * 0.01, ask: fairValue + askTick * 0.01 }));
    best = bestQuote(quotes, context, stats);
    if (best.rankings[0].utility - best.rankings[1].utility > TIE_EPSILON) break;
    best = undefined;
  }
  if (!best) throw new Error("make-market: could not build a round with a unique best quote");

  const { analysis, rankings } = best;
  const choices: MakeMarketChoice[] = rankings
    .map((rank) => ({ quote: rank.quote, label: quoteLabel(rank.quote), detail: `SPREAD ${spreadText(rank.quote)} · MID ${((rank.quote.bid + rank.quote.ask) / 2).toFixed(2)}` }))
    .sort(() => rng() - 0.5); // final display order stays shuffled

  const answerIndex = choices.findIndex((choice) => choice.quote.bid === analysis.quote.bid && choice.quote.ask === analysis.quote.ask);

  return {
    fairValue,
    inventory,
    uncertainty,
    params: roundParams,
    questionText: "Pick the two-sided quote with the highest expected utility.",
    scenarioText: `You are quoting ${fairValue.toFixed(2)} fair value with inventory ${inventory > 0 ? "+" : ""}${inventory} and per-unit uncertainty ${uncertainty.toFixed(2)}. Every quote is scored on fill probability, spread capture, adverse selection, and inventory risk.`,
    choices,
    answerIndex,
    answerText: quoteLabel(analysis.quote),
    analysis,
    runnerUp: rankings[1],
    rankings,
    explanation: explainMakeMarket(analysis, context),
  };
}

/* ------------------------------------------------------------------ */
/* Explanation (what the synthetic model found)                        */
/* ------------------------------------------------------------------ */

export function explainMakeMarket(best: QuoteAnalysis, context: MarketMakingContext): string {
  const { quote } = best;
  const q = context.inventory;
  const long = q > 0;
  const bidDistance = context.fairValue - quote.bid;
  const askDistance = quote.ask - context.fairValue;
  const spread = quote.ask - quote.bid;
  const spreadWord = spread <= 0.07 ? "tight" : spread <= 0.11 ? "moderate" : "wide";
  const askTighter = askDistance < bidDistance;
  const bidTighter = bidDistance < askDistance;

  const lead = `You are ${long ? "LONG" : "SHORT"} ${Math.abs(q)}, so a quote that helps you ${long ? "sell" : "buy"} inventory without giving away too much spread is worth more.`;

  let why: string;
  if (long && askTighter) {
    why = `${quoteLabel(quote)} keeps a ${spreadWord} spread while making the ask the more attractive side, so it helps you sell down your long position.`;
  } else if (!long && bidTighter) {
    why = `${quoteLabel(quote)} keeps a ${spreadWord} spread while making the bid the more attractive side, so it helps you buy back your short position.`;
  } else if (askTighter) {
    why = `${quoteLabel(quote)} tilts toward the ask to attract sellers while keeping a ${spreadWord} spread that protects you from being picked off.`;
  } else if (bidTighter) {
    why = `${quoteLabel(quote)} tilts toward the bid to attract buyers while keeping a ${spreadWord} spread that protects you from being picked off.`;
  } else {
    why = `${quoteLabel(quote)} holds a balanced, ${spreadWord} two-sided price — wide enough to get paid for the risk, narrow enough to still fill.`;
  }

  return `${lead} ${why}`;
}

export const inventoryText = (inventory: number): string =>
  `${inventory > 0 ? "+" : ""}${inventory} ${inventory > 0 ? "LONG" : "SHORT"}`;

export function buildMakeMarketPrompt(round: MakeMarketRound, difficulty: string): string {
  const { fairValue, inventory, uncertainty } = round;
  return [
    tutorIntro(difficulty),
    `Market: fair value ${fairValue.toFixed(2)} · inventory ${inventoryText(inventory)} · uncertainty ${uncertainty.toFixed(2)}.`,
    `Candidates: ${round.choices.map((choice) => choice.label).join(", ")}.`,
    `Correct: ${round.answerText}.`,
    `Reasoning: ${round.explanation}`,
    "Give one short, memorable rule for reading fair value, inventory, and uncertainty into a good two-sided quote.",
  ].join("\n");
}


