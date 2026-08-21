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

## Development

```bash
npm run build --workspace @quantcraft/finmath
npm run test --workspace @quantcraft/finmath
```

## License

[BSD-3-Clause](./LICENSE)
