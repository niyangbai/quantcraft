# @quantcraft/quantlibjs

QuantLib 1.43 compiled to WebAssembly with an asynchronous TypeScript API for Node.js and browsers.

- Native QuantLib C++ pricing logic
- ESM package with TypeScript declarations
- Bundled JavaScript loader and WASM binary
- No JavaScript pricing fallback
- Node.js 18 or newer

## Installation

Download `quantcraft-quantlibjs-<version>.tgz` from the GitHub Release or workflow artifact, then install it from disk:

```bash
npm install ./quantcraft-quantlibjs-0.1.0.tgz
```

## Usage

```ts
import { QuantLibRuntime } from "@quantcraft/quantlibjs";

const ql = await QuantLibRuntime.create();

const option = ql.priceEuropean({
  evaluationDate: "2025-01-01",
  maturityDate: "2026-01-01",
  spot: 100,
  strike: 100,
  riskFreeRate: 0.05,
  dividendYield: 0,
  volatility: 0.20,
  type: "call"
});

console.log(option.value, option.delta, option.vega);
```

Dates use `YYYY-MM-DD`. Rates, yields, coupon rates, and volatilities use decimal values, so 5% is `0.05`.

## API

Create one runtime and reuse it for subsequent calculations:

```ts
const ql = await QuantLibRuntime.create();
console.log(ql.version()); // "1.43"
```

| Method | Result |
| --- | --- |
| `priceStock(spot)` | Spot NPV |
| `priceEuropean(input)` | NPV and delta, gamma, vega, theta, rho |
| `priceDigital(input)` | Cash-or-nothing option NPV and Greeks |
| `priceBarrier(input)` | Analytic barrier-option NPV |
| `priceFixedRateBond(input)` | NPV, settlement value, clean price, dirty price, accrued amount, cashflow count |
| `priceZeroCouponBond(input)` | NPV, settlement value, clean price, dirty price |
| `createZeroCurve(input)` | Build a reusable interpolated QuantLib zero curve and return a handle |
| `curveDiscount(handle, date)` | Discount factor from a QuantLib zero curve |
| `curveZeroRate(handle, date)` | Compounded annual zero rate from a QuantLib zero curve |
| `curveForwardRate(handle, from, to)` | Compounded annual forward rate between two dates |
| `bumpCurveNode(handle, nodeIndex, shift)` | Create a curve with one input zero-rate node shifted by a decimal amount |
| `priceBondWithCurve(handle, input)` | Fixed-rate bond pricing, DV01, convexity, and bond price fields under a curve |
| `repriceBondBetweenCurves(beforeHandle, afterHandle, input)` | QuantLib before/after bond prices and P&L under two curves |
| `repriceBondsBetweenCurves(beforeHandle, afterHandle, evaluationDate, positions)` | Batch QuantLib repricing for fixed-rate bond positions |
| `destroyCurve(handle)` | Release a zero-curve handle |
| `impliedVolatility(input)` | Invert a vanilla European option price to implied volatility |
| `terminalPayoff(leg, underlying)` | QuantLib payoff evaluation for a terminal book leg, including forward, digital, coupon, and barrier state |
| `equityMoveProbabilities(input)` | GBM terminal up/down probabilities and forward |
| `minimumBookPayoff(legs)` | Exact minimum payoff and boundedness for supported books |
| `payoffExtremes(legs)` | Exact minimum/maximum terminal payoff and boundedness for continuous books |
| `payoffBreakevens(legs)` | Exact breakeven spots of a continuous book's terminal payoff |
| `normalCdf(x)` | Standard normal CDF (QuantLib `CumulativeNormalDistribution`) |
| `normalPdf(x)` | Standard normal PDF (QuantLib `NormalDistribution`) |
| `millsRatio(x)` | Inverse Mills ratio φ(x)/(1−Φ(x)) |

European options use QuantLib's `AnalyticEuropeanEngine`. Bonds use `FixedRateBond` or `ZeroCouponBond` with `DiscountingBondEngine`. Unsupported instruments and invalid inputs throw JavaScript errors instead of falling back to approximations.

### Fixed-rate bond example

```ts
const bond = ql.priceFixedRateBond({
  evaluationDate: "2025-01-01",
  issueDate: "2025-01-01",
  maturityDate: "2030-01-01",
  settlementDays: 0,
  faceAmount: 100,
  couponRate: 0.05,
  frequency: 2,
  redemption: 100,
  flatDiscountRate: 0.05
});

console.log(bond.cleanPrice, bond.accruedAmount, bond.dirtyPrice);
```

Supported coupon frequencies are annual (`1`), semiannual (`2`), quarterly (`4`), and monthly (`12`).

### Custom WASM location

The bundled WASM is resolved automatically. Pass explicit URLs when an application copies or serves the runtime files separately:

```ts
const ql = await QuantLibRuntime.create({
  moduleUrl: new URL("./quantlib.mjs", import.meta.url),
  wasmUrl: new URL("./quantlib.wasm", import.meta.url)
});
```

## Development

Build the TypeScript package:

```bash
npm run build --workspace @quantcraft/quantlibjs
```

Run the WASM-backed unit tests:

```bash
npm run test:quantlib
```

The reproducible WASM build is pinned to QuantLib 1.43 and Emscripten 4.0.10:

```bash
EMSDK_ROOT=/path/to/emsdk \
QUANTLIB_SOURCE=/path/to/QuantLib-1.43 \
QUANTLIB_BUILD=/path/to/quantlib-wasm-build \
BOOST_ROOT=/path/to/boost_1_88_0 \
npm run build:wasm --workspace @quantcraft/quantlibjs
```

The build script checks the Emscripten compiler, QuantLib static library, and binding source before compiling. After rebuilding, run `npm run test:quantlib` to validate the generated WASM exports.

## License

[BSD-3-Clause](./LICENSE), matching the bundled [QuantLib](https://www.quantlib.org/) runtime.
