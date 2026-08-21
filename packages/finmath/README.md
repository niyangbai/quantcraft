# @quantcraft/finmath

A unified financial-math library for option books and portfolios. One package,
modular exports — import from the barrel or from a specific module.

## Install

```bash
npm install @quantcraft/finmath
```

## Modules

| Module | Export path | Contents |
| --- | --- | --- |
| `payoff` | `@quantcraft/finmath/payoff` | Exact terminal payoff, max/min profit, breakevens |
| `risk` | `@quantcraft/finmath/risk` | Greek aggregation, risk magnitude, best-hedge search, hedge quality |
| `orderbook` | `@quantcraft/finmath/orderbook` | Price-time-priority market-order matching, best quotes, spread, depth |
| `marketmaking` | `@quantcraft/finmath/marketmaking` | Synthetic market model: fill probability, spread capture, adverse selection, inventory penalty, expected utility |
| `volsurface` | `@quantcraft/finmath/volsurface` | Parametric implied-vol surface, parameterized shocks, delta IV, analytic BSM vega, vol-only P&L |

```ts
// Barrel: everything in one import.
import { legPayoff, bestHedge } from "@quantcraft/finmath";

// Or scope the import to one module.
import { breakevens } from "@quantcraft/finmath/payoff";
import { hedgeQuality } from "@quantcraft/finmath/risk";
```

## payoff

Per-leg and book terminal payoff, maximum/minimum profit, and breakeven spots
for `equity`, `forward`, `call`, `put`, `digital`, `barrier`, `bond`, and
`coupon` legs. Book payoff is `Σ quantity × signed leg payoff`.

```ts
import { bookPayoff, payoffExtremes, breakevens } from "@quantcraft/finmath/payoff";

const call = { kind: "call", side: "long", quantity: 1, strike: 100, optionType: "call", cashPayoff: 10, faceAmount: 100, couponRate: 5, barrier: 80, barrierType: "down-out", barrierTouched: false, rebate: 0 };
const put = { ...call, kind: "put" };

bookPayoff([call, put], 130); // 30
payoffExtremes([call]); // { max: "unbounded", min: 0 }
breakevens([call]); // [100]
```

Digital and barrier legs are discontinuous, so `payoffExtremes` and
`breakevens` return `undefined` / `[]` for books containing them.

## risk

Given per-leg Greeks (typically from `@quantcraft/quantlibjs`), aggregate a
book, measure its risk magnitude against a scale, find the best subset of
hedge tools, and score a chosen hedge from 0..1.

```ts
import { addRisk, bestHedge, hedgeQuality, DEFAULT_GREEK_SCALES } from "@quantcraft/finmath/risk";

const preTrade = { delta: 0.42, gamma: 0.02, vega: 11, theta: -1.4, rho: 3.2 };
const trades = [
  { id: "buy-stock", delta: 1, gamma: 0, vega: 0, theta: 0, rho: 0 },
  { id: "sell-call", delta: -0.55, gamma: -0.03, vega: -8, theta: 1.1, rho: -2 },
];

const { bestTrades, beforeRisk, bestRisk, risk } = bestHedge({ preTrade, trades, scales: DEFAULT_GREEK_SCALES });
const chosenRisk = risk(addRisk(preTrade, trades[0]));
const quality = hedgeQuality({ beforeRisk, chosenRisk, bestRisk }); // 0..1
```

## orderbook

Deterministic market-order execution with price-time priority. A market buy
consumes asks from the best (lowest) price up; a market sell consumes bids
from the best (highest) price down. The input book is never mutated.

```ts
import { matchMarketOrder, bestAsk, depthAt } from "@quantcraft/finmath/orderbook";

const book = {
  bids: [{ price: 100.02, size: 250 }],
  asks: [{ price: 100.04, size: 150 }, { price: 100.06, size: 200 }],
};

const result = matchMarketOrder(book, "buy", 200);
// fills 150 @ 100.04 then 50 @ 100.06
bestAsk(result.book); // 100.06
depthAt(result.book, "ask", 100.06); // 150
result.averagePrice; // 100.045 (VWAP)
```

## marketmaking

A synthetic market-making model that scores any two-sided quote on four
closed-form components and returns an expected utility. The model is
deterministic, so the best quote is always the maximum-utility one.

- **Fill probability** — `p = λ · exp(−κ·δ/σ)` per side, where `δ` is the
  distance of the quote from fair value; every `σ` of distance cuts the fill
  probability by `e^κ`.
- **Spread capture** — `p_sell·(ask−fair) + p_buy·(fair−bid)`, the expected
  gross edge earned on fills.
- **Adverse selection** — a fraction `A` of fills is informed; conditional on
  one, the value has moved through the quote by `σ · Mills(z)` (truncated-
  normal mean), so the cost is `p · A · σ · Mills(z)`.
- **Inventory penalty** — a trade moves the position to `q ∓ 1`, changing its
  variance by `[(q∓1)² − q²]·σ²·T`; the mean-variance score subtracts
  `γ/2` times that excess variance (negative for a long that sells — a
  de-risking rebate).

Expected utility = spread capture − adverse selection − inventory penalty.

```ts
import { analyzeQuote, bestQuote } from "@quantcraft/finmath/marketmaking";

const context = { fairValue: 100, inventory: 40, uncertainty: 0.15, riskAversion: 0.2 };
const candidates = [
  { bid: 99.94, ask: 100.06 },
  { bid: 99.96, ask: 100.04 },
  { bid: 99.92, ask: 100.08 },
  { bid: 99.95, ask: 100.07 },
];

const { quote, analysis, rankings } = bestQuote(candidates, context);
// quote = { bid: 99.92, ask: 100.08 }  (highest expected utility)
analysis.fillProbability;   // 0.264
analysis.expectedEdge;      // 0.0211
analysis.adverseSelection;  // 0.0092
analysis.inventoryPenalty;  // 0.0006
```

## volsurface

A deterministic implied-volatility surface with parameterized shocks and the
vol-only P&L of an option position under a shock.

- **Surface** — `σ(t,K) = atm(t) + skew·m + curvature·m²` with
  `m = ln(K/S)` and `atm(t) = atmLevel + termSlope·t`. Every shock rebuilds the
  surface, so `ΔIV` between the base and shocked surface is exact.
- **Shocks** — skew steepening/flattening, front- or back-end vol up (a term
  bump that fades with maturity or builds toward it), smile curvature up/down.
- **Vega** — the analytic Black–Scholes–Merton vega per 1 vol point (calls and
  puts agree), exactly what an analytic European engine reports for a flat vol
  equal to the surface's `blackVol` at the option's own strike and expiry.

```ts
import { applyVolShock, blackVol, analyzeVolPnl } from "@quantcraft/finmath/volsurface";

const base = { spot: 100, riskFreeRate: 0.025, dividendYield: 0.015, atmLevel: 0.22, termSlope: 0.05, skew: -0.5, curvature: 0.9 };
const shocked = applyVolShock(base, { type: "skew-steepen", magnitude: 0.15 });

blackVol(base, 0.25, 85);   // 0.338 (33.8%)
blackVol(shocked, 0.25, 85); // 0.362 — the low strike just gained 2.4 pts

const put = analyzeVolPnl(base, shocked, { kind: "put", strike: 85, maturity: 0.25, side: "long", qty: 1 });
// put.deltaIVPoints = 2.44 · put.vegaPerPoint = 0.113 · put.pnl = +0.276

const atmCall = analyzeVolPnl(base, shocked, { kind: "call", strike: 100, maturity: 0.25, side: "long", qty: 1 });
// atmCall.deltaIVPoints = 0 · atmCall.pnl = 0 (a skew pivot leaves ATM alone)
```

## Development

```bash
npm run build --workspace @quantcraft/finmath
npm run test --workspace @quantcraft/finmath
```

## License

[BSD-3-Clause](./LICENSE)
