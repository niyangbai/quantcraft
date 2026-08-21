import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "../dist/index.js";

const moduleUrl = new URL("../wasm/quantlib.mjs", import.meta.url);
const wasmUrl = fileURLToPath(new URL("../wasm/quantlib.wasm", import.meta.url));
const runtime = await QuantLibRuntime.create({ moduleUrl, wasmUrl });
const close = (a, b, t = 1e-10) => assert.ok(Math.abs(a - b) <= t, `${a} != ${b}`);
test("loads official QuantLib 1.43 WASM", () => assert.equal(runtime.version(), "1.43"));
test("QuantLib Stock instrument returns its quote NPV", () => close(runtime.priceStock(123.45).value, 123.45));
test("European option matches QuantLib Black-Scholes benchmark", () => {
    const r = runtime.priceEuropean({ evaluationDate: "2025-01-01", maturityDate: "2026-01-01", spot: 100, strike: 100, riskFreeRate: .05, volatility: .2, type: "call" });
    close(r.value, 10.450583572185565, 2e-12);
});
test("fixed coupon bond returns QuantLib price fields", () => {
    const r = runtime.priceFixedRateBond({ evaluationDate: "2025-01-01", issueDate: "2025-01-01", maturityDate: "2030-01-01", settlementDays: 0, couponRate: .05, frequency: 2, flatDiscountRate: .05 });
    assert.ok(Number.isFinite(r.value)); close(r.cleanPrice + r.accruedAmount, r.dirtyPrice); assert.equal(r.cashflowCount, 11);
});
test("zero coupon bond discounts in QuantLib", () => {
    const r = runtime.priceZeroCouponBond({ evaluationDate: "2025-01-01", maturityDate: "2027-01-01", settlementDays: 0, flatDiscountRate: .05 });
    // TARGET/Following adjusts the New Year's Day maturity to 2027-01-04.
    close(r.value, 90.44656434395189, 1e-12);
});
test("QuantLib validation is surfaced as a JavaScript error", () => {
    assert.throws(() => runtime.priceFixedRateBond({ evaluationDate: "2025-01-01", issueDate: "2025-01-01", maturityDate: "2030-01-01", settlementDays: 0, couponRate: .05, frequency: 3, flatDiscountRate: .05 }), /unsupported coupon frequency/);
});
test("cash digital call and put satisfy QuantLib discounted-cash parity", () => {
    const common = { evaluationDate: "2025-01-01", maturityDate: "2026-01-01", spot: 100, strike: 100, riskFreeRate: .05, volatility: .2, cashPayoff: 10 };
    const call = runtime.priceDigital({ ...common, type: "call" });
    const put = runtime.priceDigital({ ...common, type: "put" });
    close(call.value + put.value, 10 * Math.exp(-.05), 2e-12);
});
test("equity GBM up and downside probabilities are complementary", () => {
    const r = runtime.equityMoveProbabilities({ evaluationDate: "2025-01-01", maturityDate: "2026-01-01", spot: 100, riskFreeRate: .05, dividendYield: .01, volatility: .2 });
    close(r.upProbability + r.downProbability, 1, 2e-12);
    assert.ok(r.upProbability > 0 && r.upProbability < 1);
    close(r.forward, 100 * Math.exp(.04), 2e-12);
});
test("down-in plus down-out barrier options reproduce the vanilla call", () => {
    const common = { evaluationDate: "2025-01-01", maturityDate: "2026-01-01", spot: 100, strike: 100, barrier: 80, riskFreeRate: .05, volatility: .2, type: "call", rebate: 0 };
    const downIn = runtime.priceBarrier({ ...common, barrierType: "down-in" });
    const downOut = runtime.priceBarrier({ ...common, barrierType: "down-out" });
    const vanilla = runtime.priceEuropean(common);
    close(downIn.value + downOut.value, vanilla.value, 2e-12);
});
test("whole-book minimum recognizes a protective put", () => {
    const base = { strike: 100, call: true, cashPayoff: 0, redemption: 0, rebate: 0 };
    const r = runtime.minimumBookPayoff([
        { ...base, kind: "equity", quantity: 1 },
        { ...base, kind: "put", call: false, quantity: 1 },
    ]);
    assert.equal(r.bounded, true); close(r.value, 100, 1e-8);
});
test("whole-book minimum detects an unbounded short call", () => {
    const r = runtime.minimumBookPayoff([{ kind: "call", quantity: -1, strike: 100, call: true, cashPayoff: 0, redemption: 0, rebate: 0 }]);
    assert.equal(r.bounded, false); assert.equal(r.value, -Infinity);
});
test("bond plus long call has its redemption as minimum payoff", () => {
    const r = runtime.minimumBookPayoff([
        { kind: "bond", quantity: 1, strike: 0, call: true, cashPayoff: 0, redemption: 100, rebate: 0 },
        { kind: "call", quantity: 1, strike: 100, call: true, cashPayoff: 0, redemption: 0, rebate: 0 },
    ]);
    assert.equal(r.bounded, true); close(r.value, 100, 1e-8);
});
