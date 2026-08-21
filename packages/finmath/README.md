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

## Development

```bash
npm run build --workspace @quantcraft/finmath
npm run test --workspace @quantcraft/finmath
```

## License

[BSD-3-Clause](./LICENSE)
