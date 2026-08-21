// @quantcraft/finmath — a unified financial-math library.
//
// One package, modular exports, like date-fns / lodash:
//   import { legPayoff, bestHedge } from "@quantcraft/finmath";
//   import { breakevens } from "@quantcraft/finmath/payoff";
//   import { hedgeQuality } from "@quantcraft/finmath/risk";
//
// Modules:
//   payoff — exact terminal payoff, max/min profit, breakevens for option books
//   risk   — Greek aggregation, risk magnitude, best-hedge search, quality
// Add more modules (volatility, probability, interest rates, ...) the same way.

export * from "./payoff.js";
export * from "./risk.js";
