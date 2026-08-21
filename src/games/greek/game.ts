// games/greek/game.ts — business logic for the Greek drill.
// Generates a market scenario, a position, and the requested Greek metric,
// then evaluates it before/after the shock through @quantcraft/quantlibjs.
// No React, no storage.

import { between, isoDate, market } from "../../game";
import type { QuestionBank } from "../../game";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";

export type GreekScenario = { label: string; detail: string; spot: number; vol: number; rate: number; date: string };
export type GreekBook = { name: string; legs: { type: "call" | "put"; strike: number; qty: number }[] };
export type GreekMetric = "value" | "delta" | "gamma" | "vega" | "theta" | "rho";

export type GreekDirection = "down" | "unchanged" | "up";

export type GreekQuestion = {
  scenario: GreekScenario;
  marketMove: {
    beforeSpot: number;
    afterSpot: number;
    beforeVolatility: number;
    afterVolatility: number;
    beforeRate: number;
    afterRate: number;
    spotDirection: GreekDirection;
    volatilityDirection: GreekDirection;
    rateDirection: GreekDirection;
  };
  book: GreekBook;
  metric: string;
  before: number;
  after: number;
  direction: GreekDirection;
};

export const displayedDirection = (before: number, after: number, precision: number): GreekDirection => {
  const displayedBefore = Number(before.toFixed(precision));
  const displayedAfter = Number(after.toFixed(precision));
  if (displayedAfter === displayedBefore) return "unchanged";
  return displayedAfter > displayedBefore ? "up" : "down";
};

export const greekDirection = (before: number, after: number): GreekDirection =>
  displayedDirection(before, after, 4);

const METRIC_LABELS: Record<GreekMetric, string> = { value: "FAIR VALUE", delta: "DELTA", gamma: "GAMMA", vega: "VEGA", theta: "THETA", rho: "RHO" };

export function generateGreekQuestion(rng: () => number, ql: QuantLibRuntime, bank: QuestionBank["greek"]): GreekQuestion {
  const { scenarios, books, metrics } = bank;
  const scenarioTemplate = scenarios[Math.floor(rng() * scenarios.length)];
  const bookTemplate = books[Math.floor(rng() * books.length)];
  const metric = metrics[Math.floor(rng() * metrics.length)];
  const baseSpot = Math.round(between(rng, 80, 125));
  const baseVol = Number(between(rng, .12, .36).toFixed(4));
  const baseRate = Number(between(rng, .005, .06).toFixed(4));
  const dividend = Number(between(rng, 0, .035).toFixed(4));
  const afterSpot = Number((baseSpot * scenarioTemplate.spot / 100).toFixed(2));
  const afterVol = Math.max(.03, Number((baseVol * scenarioTemplate.vol / .2).toFixed(4)));
  const afterRate = Number((baseRate + scenarioTemplate.rate - .025).toFixed(4));
  const scenarioDate = new Date(`${scenarioTemplate.date}T00:00:00Z`);
  const monthShift = (scenarioDate.getUTCFullYear() - 2025) * 12 + scenarioDate.getUTCMonth();
  const afterDate = new Date("2025-01-02T00:00:00Z");
  afterDate.setUTCMonth(afterDate.getUTCMonth() + monthShift);
  const scale = baseSpot / 100;
  const book = { ...bookTemplate, legs: bookTemplate.legs.map((leg) => ({ ...leg, strike: Math.round(leg.strike * scale) })) };
  const scenario = { ...scenarioTemplate, spot: afterSpot, vol: afterVol, rate: afterRate, date: isoDate(afterDate) };
  const marketMove = {
    beforeSpot: baseSpot,
    afterSpot,
    beforeVolatility: baseVol,
    afterVolatility: afterVol,
    beforeRate: baseRate,
    afterRate,
    spotDirection: displayedDirection(baseSpot, afterSpot, 2),
    volatilityDirection: displayedDirection(baseVol * 100, afterVol * 100, 1),
    rateDirection: displayedDirection(baseRate * 100, afterRate * 100, 2),
  };
  const evaluate = (spot: number, vol: number, rate: number, date: string) => book.legs.reduce((sum, leg) => {
    const result = ql.priceEuropean({ evaluationDate: date, maturityDate: market.maturityDate, spot, strike: leg.strike, riskFreeRate: rate, dividendYield: dividend, volatility: vol, type: leg.type });
    return sum + leg.qty * result[metric];
  }, 0);
  const before = evaluate(baseSpot, baseVol, baseRate, "2025-01-02");
  const after = evaluate(scenario.spot, scenario.vol, scenario.rate, scenario.date);
  return { scenario, marketMove, book, metric: METRIC_LABELS[metric], before, after, direction: greekDirection(before, after) };
}
