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
export const makeMarketDurationMs = (streak: number): number => Math.max(4500, 10000 - streak * 250);

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

const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
const shuffle = <T,>(rng: () => number, items: readonly T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

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
    explanation: explainMakeMarket(analysis, rankings[1], context),
  };
}

/* ------------------------------------------------------------------ */
/* Explanation (what the synthetic model found)                        */
/* ------------------------------------------------------------------ */

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const signed = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;

export function explainMakeMarket(best: QuoteAnalysis, runnerUp: QuoteAnalysis, context: MarketMakingContext): string {
  const { quote } = best;
  const parts: string[] = [];

  parts.push(
    `Best ${quoteLabel(quote)} (EU ${signed(best.utility)}): fills ${pct(best.fillProbability)} · edge ${signed(best.expectedEdge)} · adverse ${signed(-best.adverseSelection)} · inventory ${signed(-best.inventoryPenalty)}.`,
  );

  // Dominant factor
  const inventoryMagnitude = Math.abs(best.inventoryPenalty);
  if (inventoryMagnitude > 0.002) {
    const deRisking = best.inventoryPenalty < 0;
    const direction = deRisking
      ? `a ${context.inventory > 0 ? "long" : "short"} is rewarded for ${context.inventory > 0 ? "selling" : "buying"}`
      : `the quote leans into ${context.inventory > 0 ? "more buying" : "more selling"} on top of a ${context.inventory > 0 ? "long" : "short"}`;
    parts.push(
      `Inventory is the deciding factor: ${direction} — each trade shifts position variance by ±(2q+1)·σ², worth ${signed(-best.inventoryPenalty)} here.`,
    );
  } else if (best.adverseSelection > best.expectedEdge * 0.6) {
    parts.push(
      `Adverse selection dominates: part of every fill is informed and the value moves through tight quotes, eating the edge — so a quote too close to fair loses.`,
    );
  } else if (best.fillProbability < 0.3) {
    parts.push(`Wide quotes still fill ${pct(best.fillProbability)} of the time, so you keep most of the edge without inviting toxic fills.`);
  } else {
    parts.push(`The winner balances spread capture against adverse selection: it fills ${pct(best.fillProbability)} with edge ${signed(best.expectedEdge)} and adverse cost only ${signed(-best.adverseSelection)}.`);
  }

  parts.push(
    `Runner-up ${quoteLabel(runnerUp.quote)}: EU ${signed(runnerUp.utility)}, ${(Math.abs(best.utility - runnerUp.utility) * 100).toFixed(2)}¢/round behind.`,
  );

  return parts.join(" ");
}

export const inventoryText = (inventory: number): string =>
  `${inventory > 0 ? "+" : ""}${inventory} ${inventory > 0 ? "LONG" : "SHORT"}`;

export function buildMakeMarketPrompt(round: MakeMarketRound, difficulty: string): string {
  const { fairValue, inventory, uncertainty, analysis } = round;
  return [
    `I am training as a ${difficulty} on the QuantCraft Make Market drill.`,
    `Market: fair value ${fairValue.toFixed(2)} · inventory ${inventoryText(inventory)} · uncertainty ${uncertainty.toFixed(2)}.`,
    `Candidates: ${round.choices.map((choice) => choice.label).join(", ")}.`,
    `Correct: ${round.answerText} (expected utility ${analysis.utility.toFixed(4)}).`,
    `Synthetic model breakdown: fill ${(analysis.fillProbability * 100).toFixed(1)}% · spread capture ${analysis.expectedEdge.toFixed(4)} · adverse selection ${analysis.adverseSelection.toFixed(4)} · inventory penalty ${analysis.inventoryPenalty.toFixed(4)}.`,
    `Working: ${round.explanation}`,
    "Give a short, level-appropriate rule for reading fair value + inventory + uncertainty into a good two-sided quote instantly.",
  ].join("\n");
}


