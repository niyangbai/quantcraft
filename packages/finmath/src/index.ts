// @quantcraft/finmath — a unified financial-math library.
//
// One package, modular exports, like date-fns / lodash:
//   import { legPayoff, bestHedge } from "@quantcraft/finmath";
//   import { breakevens } from "@quantcraft/finmath/payoff";
//   import { hedgeQuality } from "@quantcraft/finmath/risk";
//   import { matchMarketOrder } from "@quantcraft/finmath/orderbook";
//
// Modules:
//   payoff      — exact terminal payoff, max/min profit, breakevens for option books
//   risk        — Greek aggregation, risk magnitude, best-hedge search, quality
//   orderbook   — price-time-priority market-order matching, quotes, spread, depth
//   marketmaking— synthetic market model: fill probability, spread capture,
//                 adverse selection, inventory penalty, expected utility
//   volsurface  — parametric implied-vol surface, parameterized shocks, delta IV,
//                 analytic BSM vega, vol-only P&L
// Add more modules (volatility, probability, interest rates, ...) the same way.

export * from "./payoff.js";
export * from "./risk.js";
export * from "./orderbook.js";
export * from "./marketmaking.js";
export * from "./volsurface.js";
