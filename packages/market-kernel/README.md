# @quantcraft/market-kernel

Official QuantLib 1.43 compiled to WebAssembly. Pricing logic lives in QuantLib C++; TypeScript only validates transport data and exposes an asynchronous runtime suitable for browsers, Web Workers, and Node.js.

Supported bindings:

- Equity spot value
- European call/put through `AnalyticEuropeanEngine`
- Cash-or-nothing digital call/put
- Analytic barrier call/put
- Fixed coupon bond through `FixedRateBond` + `DiscountingBondEngine`
- Zero coupon bond through `ZeroCouponBond` + `DiscountingBondEngine`
- GBM terminal up/down probabilities and forward
- Exact minimum terminal payoff for supported multi-leg books

Unsupported instruments are not approximated.

```ts
const ql = await QuantLibRuntime.create();
const result = ql.priceEuropean({
  evaluationDate: "2025-01-01",
  maturityDate: "2026-01-01",
  spot: 100,
  strike: 100,
  riskFreeRate: 0.05,
  volatility: 0.20,
  type: "call"
});
```

## Reproducible WASM build

The build is pinned to QuantLib 1.43 and Emscripten 4.0.10. Build QuantLib as a static Emscripten library, then run:

```bash
EMSDK_ROOT=/path/to/emsdk \
QUANTLIB_SOURCE=/path/to/QuantLib-1.43 \
QUANTLIB_BUILD=/path/to/quantlib-wasm-build \
BOOST_ROOT=/path/to/boost_1_88_0 \
npm run build:wasm
```

The generated `wasm/quantlib.mjs` and `wasm/quantlib.wasm` are the runtime artifacts. Tests execute the WASM module itself rather than a TypeScript fallback.
