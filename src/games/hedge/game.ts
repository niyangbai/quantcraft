// games/hedge/game.ts — business logic for the Hedge drill.
// Generates a shocked client book, prices it through @quantcraft/quantlibjs,
// builds hedge tools, finds the best hedge via @quantcraft/finmath (risk),
// and settles the player's chosen hedge. No React, no storage.

import { between, isoDate, pick } from "../../game.js";
import type { QuestionBank } from "../../game.js";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { DEFAULT_GREEK_SCALES, GREEK_KEYS, addRisk, bestHedge, hedgeQuality } from "@quantcraft/finmath";
import type { GreekKey, GreekRisk } from "@quantcraft/finmath";

export type HedgeLeg = { type: "call" | "put"; strike: number; qty: number };
export type HedgeProduct = { name: string; description: string; extra: string; legs: HedgeLeg[] };

export type HedgeShock = { label: string; spot: number; vol: number; detail: string };

export const HEDGE_SHOCKS: HedgeShock[] = [
  { label: "Risk-off selloff", spot: .82, vol: .13, detail: "Spot gaps lower and implied volatility jumps." },
  { label: "Relief rally", spot: 1.16, vol: -.05, detail: "Spot rallies while implied volatility softens." },
  { label: "Volatility shock", spot: .97, vol: .15, detail: "Spot is nearly unchanged, but volatility reprices sharply higher." },
  { label: "Volatility crush", spot: 1.02, vol: -.1, detail: "The catalyst passes and implied volatility collapses." },
];

export type HedgeTrade = {
  id: string;
  side: "long" | "short";
  label: string;
  detail: string;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  postDelta: number;
  postGamma: number;
  postVega: number;
  postTheta: number;
  postRho: number;
};

/** The trade label without its LONG/SHORT prefix, for badge rendering. */
export const tradeBody = (trade: HedgeTrade): string => trade.label.slice(trade.label.indexOf(" ") + 1);

export type HedgeRound = {
  template: HedgeProduct;
  shock: HedgeShock;
  maturityDate: string;
  beforeSpot: number;
  beforeVolatility: number;
  spot: number;
  volatility: number;
  legs: HedgeLeg[];
  preTrade: GreekRisk;
  trades: HedgeTrade[];
  objectiveKeys: GreekKey[];
  bestTrades: HedgeTrade[];
  beforeRisk: number;
  bestRisk: number;
  risk: (greeks: GreekRisk) => number;
};

export type HedgeSettlement = {
  passed: boolean;
  score: number;
  bestTradeIds: string[];
  greeks: GreekRisk;
  timedOut: boolean;
  quality: number;
};

export function generateHedgeRound(rng: () => number, ql: QuantLibRuntime, bank: QuestionBank["hedge"]): HedgeRound {
  const template = pick(rng, bank.products);
  const shock = pick(rng, HEDGE_SHOCKS);
  const evaluation = new Date(Date.UTC(2025, 0, 2));
  evaluation.setUTCMonth(evaluation.getUTCMonth() + Math.floor(between(rng, 0, 36)));
  const maturity = new Date(evaluation);
  maturity.setUTCMonth(maturity.getUTCMonth() + Math.floor(between(rng, 18, 61)));
  const evaluationDate = isoDate(evaluation);
  const maturityDate = isoDate(maturity);
  const beforeSpot = Number(between(rng, 82, 128).toFixed(2));
  const beforeVolatility = Number(between(rng, .16, .32).toFixed(4));
  const spot = Number((beforeSpot * shock.spot).toFixed(2));
  const volatility = Number(Math.max(.06, beforeVolatility + shock.vol).toFixed(4));
  const rate = Number(between(rng, -0.005, 0.065).toFixed(4));
  const dividend = Number(between(rng, 0, 0.045).toFixed(4));
  const participation = between(rng, 0.65, 1.35);
  const legs = template.legs.map((leg) => ({
    ...leg,
    qty: Number((leg.qty * participation).toFixed(2)),
    strike: Number((beforeSpot * leg.strike / 100 * between(rng, 0.98, 1.02)).toFixed(2)),
  }));
  const price = (leg: HedgeLeg) => ql.priceEuropean({ evaluationDate, maturityDate, spot, strike: leg.strike, riskFreeRate: rate, dividendYield: dividend, volatility, type: leg.type });
  const client = legs.reduce((book, leg) => {
    const priced = price(leg);
    return { delta: book.delta + leg.qty * priced.delta, gamma: book.gamma + leg.qty * priced.gamma, vega: book.vega + leg.qty * priced.vega, theta: book.theta + leg.qty * priced.theta, rho: book.rho + leg.qty * priced.rho };
  }, { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 });
  const preTrade = { delta: -client.delta, gamma: -client.gamma, vega: -client.vega, theta: -client.theta, rho: -client.rho };
  const callStrike = Number((spot * 1.05).toFixed(2));
  const putStrike = Number((spot * .95).toFixed(2));
  const call = price({ type: "call", strike: callStrike, qty: 1 });
  const put = price({ type: "put", strike: putStrike, qty: 1 });
  const quantity = .5;
  const trades: HedgeTrade[] = [
    { id: "buy-stock", side: "long" as const, label: "LONG STOCK", detail: "Long Delta · neutral other Greeks", delta: quantity, gamma: 0, vega: 0, theta: 0, rho: 0 },
    { id: "sell-stock", side: "short" as const, label: "SHORT STOCK", detail: "Short Delta · neutral other Greeks", delta: -quantity, gamma: 0, vega: 0, theta: 0, rho: 0 },
    { id: "buy-call", side: "long" as const, label: `LONG ${callStrike} CALL`, detail: "Long Delta · Gamma · Vega", delta: quantity * call.delta, gamma: quantity * call.gamma, vega: quantity * call.vega, theta: quantity * call.theta, rho: quantity * call.rho },
    { id: "sell-call", side: "short" as const, label: `SHORT ${callStrike} CALL`, detail: "Short Delta · Gamma · Vega", delta: -quantity * call.delta, gamma: -quantity * call.gamma, vega: -quantity * call.vega, theta: -quantity * call.theta, rho: -quantity * call.rho },
    { id: "buy-put", side: "long" as const, label: `LONG ${putStrike} PUT`, detail: "Short Delta · Gamma · long Vega", delta: quantity * put.delta, gamma: quantity * put.gamma, vega: quantity * put.vega, theta: quantity * put.theta, rho: quantity * put.rho },
    { id: "sell-put", side: "short" as const, label: `SHORT ${putStrike} PUT`, detail: "Long Delta · Gamma · short Vega", delta: -quantity * put.delta, gamma: -quantity * put.gamma, vega: -quantity * put.vega, theta: -quantity * put.theta, rho: -quantity * put.rho },
  ].map((trade) => ({
    ...trade,
    postDelta: preTrade.delta + trade.delta,
    postGamma: preTrade.gamma + trade.gamma,
    postVega: preTrade.vega + trade.vega,
    postTheta: preTrade.theta + trade.theta,
    postRho: preTrade.rho + trade.rho,
  }));
  const objectiveCount = 1 + Math.floor(rng() * 3);
  const objectiveKeys = [...GREEK_KEYS].sort(() => rng() - .5).slice(0, objectiveCount);
  const hedge = bestHedge({ preTrade, trades, scales: DEFAULT_GREEK_SCALES, keys: objectiveKeys });
  return { template, shock, maturityDate, beforeSpot, beforeVolatility, spot, volatility, legs, preTrade, trades, objectiveKeys, bestTrades: hedge.bestTrades, beforeRisk: hedge.beforeRisk, bestRisk: hedge.bestRisk, risk: hedge.risk };
}

export function settleHedge(round: HedgeRound, selectedTradeIds: string[], secondsLeft: number, timedOut: boolean): HedgeSettlement {
  const selectedIds = selectedTradeIds.filter((id) => id !== "do-nothing");
  const selected = round.trades.filter((trade) => selectedIds.includes(trade.id));
  const greeks = selected.reduce((sum, trade) => addRisk(sum, trade), round.preTrade);
  const chosenRisk = round.risk(greeks);
  const exactMatch = selectedIds.length === round.bestTrades.length && selectedIds.every((id) => round.bestTrades.some((trade) => trade.id === id));
  const quality = hedgeQuality({ beforeRisk: round.beforeRisk, chosenRisk, bestRisk: round.bestRisk, exactMatch });
  const passed = !timedOut && quality >= .8;
  const score = passed ? Math.round(100 + quality * 40 + secondsLeft * .4) : -50;
  return { passed, score, bestTradeIds: round.bestTrades.map((trade) => trade.id), greeks, timedOut, quality };
}

