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
test("QuantLib implied volatility inverts a vanilla European price", () => {
    const common = { evaluationDate: "2025-01-01", maturityDate: "2026-01-01", spot: 100, strike: 100, riskFreeRate: .05, dividendYield: .01, type: "call" };
    const price = runtime.priceEuropean({ ...common, volatility: .24 }).value;
    // QuantLib's impliedVolatility default accuracy is 1e-4.
    close(runtime.impliedVolatility({ ...common, targetValue: price }).value, .24, 1e-4);
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
test("zero curve discounts and reprices bonds before and after a curve shock", () => {
    const base = runtime.createZeroCurve({
        evaluationDate: "2025-01-01",
        dates: ["2027-01-01", "2030-01-01", "2035-01-01"],
        zeroRates: [.03, .034, .037],
    });
    const shocked = runtime.createZeroCurve({
        evaluationDate: "2025-01-01",
        dates: ["2027-01-01", "2030-01-01", "2035-01-01"],
        zeroRates: [.032, .0345, .036],
    });
    try {
        assert.ok(runtime.curveDiscount(base, "2030-01-01") > runtime.curveDiscount(base, "2035-01-01"));
        const bond = { evaluationDate: "2025-01-01", issueDate: "2025-01-01", maturityDate: "2030-01-01", settlementDays: 0, couponRate: .05, frequency: 2 };
        const before = runtime.priceBondWithCurve(base, bond);
        const bumped = runtime.bumpCurveNode(base, 1, .0001);
        const reprice = runtime.repriceBondBetweenCurves(base, shocked, bond);
        close(reprice.before, before.value, 1e-10);
        close(reprice.pnl, reprice.after - reprice.before, 1e-12);
        const keyRateReprice = runtime.repriceBondBetweenCurves(base, bumped, bond);
        assert.ok(keyRateReprice.pnl < 0, "a positive 5Y node shock lowers the bond price");
        const batch = runtime.repriceBondsBetweenCurves(base, shocked, "2025-01-01", [
            { issueDate: "2025-01-01", maturityDate: "2030-01-01", settlementDays: 0, couponRate: .05, frequency: 2 },
        ]);
        close(batch[0].pnl, reprice.pnl, 1e-10);
        assert.ok(Number.isFinite(before.dv01) && before.dv01 > 0);
        assert.ok(Number.isFinite(before.convexity));
        runtime.destroyCurve(bumped);
    } finally {
        runtime.destroyCurve(base);
        runtime.destroyCurve(shocked);
    }
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
test("QuantLib terminal payoff binding handles forward, coupon, and barrier state", () => {
    const base = { quantity: 1, strike: 100, call: true, cashPayoff: 10, redemption: 100, rebate: 0 };
    close(runtime.terminalPayoff({ ...base, kind: "forward" }, 112), 12);
    close(runtime.terminalPayoff({ ...base, kind: "coupon", couponRate: .05 }, 112), 105);
    close(runtime.terminalPayoff({ ...base, kind: "barrier", barrierTouched: false, barrierType: "down-out" }, 115), 15);
    close(runtime.terminalPayoff({ ...base, kind: "barrier", barrierTouched: true, barrierType: "down-out" }, 115), 0);
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
test("BlackVarianceSurface reproduces the grid at nodes and interpolates between", () => {
    const handle = runtime.createVolSurface({
        evaluationDate: "2025-01-02",
        expiries: ["2025-02-02", "2025-04-02", "2025-07-02", "2026-01-02"],
        strikes: [82, 90, 100, 111, 122],
        vols: [
            [0.20, 0.19, 0.18, 0.17, 0.16],
            [0.21, 0.20, 0.19, 0.18, 0.17],
            [0.22, 0.21, 0.20, 0.19, 0.18],
            [0.23, 0.22, 0.21, 0.20, 0.19],
        ],
    });
    try {
        close(runtime.volSurfaceBlackVol(handle, "2025-04-02", 100), 0.19, 1e-12);
        close(runtime.volSurfaceBlackVol(handle, "2026-01-02", 82), 0.23, 1e-12);
        const mid = runtime.volSurfaceBlackVol(handle, "2025-04-02", 95);
        assert.ok(mid > 0.19 && mid < 0.20, `interpolated vol ${mid} inside the local range`);
    } finally {
        runtime.destroyVolSurface(handle);
    }
});
test("European vega under a BlackVarianceSurface equals the flat-vol engine at the local vol", () => {
    const flat = 0.19;
    const vols = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => flat));
    const handle = runtime.createVolSurface({
        evaluationDate: "2025-01-02",
        expiries: ["2025-02-02", "2025-04-02", "2025-07-02", "2026-01-02"],
        strikes: [82, 90, 100, 111, 122],
        vols,
    });
    try {
        const common = { evaluationDate: "2025-01-02", maturityDate: "2025-04-02", spot: 100, strike: 100, riskFreeRate: .025, dividendYield: .015 };
        const surface = runtime.priceEuropeanUnderSurface(handle, { ...common, type: "call" });
        const flatEngine = runtime.priceEuropean({ ...common, volatility: flat, type: "call" });
        close(surface.vega, flatEngine.vega, 1e-9);
        close(surface.value, flatEngine.value, 1e-9);
    } finally {
        runtime.destroyVolSurface(handle);
    }
});
test("vol surfaces reject ragged matrices, single-point grids, and unknown handles", () => {
    // A surface with a single expiry × single strike cannot interpolate.
    assert.throws(() => runtime.createVolSurface({ evaluationDate: "2025-01-02", expiries: ["2025-02-02"], strikes: [100], vols: [[0.2]] }), /not enough y points/);
    // A ragged matrix (missing a row for the second expiry) is rejected by the runtime flattening.
    assert.throws(() => runtime.createVolSurface({ evaluationDate: "2025-01-02", expiries: ["2025-02-02", "2025-04-02"], strikes: [100], vols: [[0.2]] }), /vol surface matrix is incomplete/);
    assert.throws(() => runtime.volSurfaceBlackVol(999, "2025-04-02", 100), /unknown vol surface handle/);
});
test("destroyed curve and vol-surface handles fail with a defined error", () => {
    const curve = runtime.createZeroCurve({ evaluationDate: "2025-01-02", dates: ["2027-01-04", "2030-01-04"], zeroRates: [.03, .034] });
    assert.ok(Number.isFinite(runtime.curveDiscount(curve, "2027-01-04")));
    runtime.destroyCurve(curve);
    assert.throws(() => runtime.curveDiscount(curve, "2027-01-04"), /unknown yield curve handle/);
    assert.throws(() => runtime.curveZeroRate(curve, "2027-01-04"), /unknown yield curve handle/);
    assert.throws(() => runtime.bumpCurveNode(curve, 0, .0001), /unknown yield curve handle/);
    assert.doesNotThrow(() => runtime.destroyCurve(curve), "double destroy is a safe no-op");
    assert.throws(() => runtime.curveDiscount(9999, "2027-01-04"), /unknown yield curve handle/);

    const handle = runtime.createVolSurface({
        evaluationDate: "2025-01-02",
        expiries: ["2025-04-02", "2025-07-02", "2026-01-02"],
        strikes: [90, 100, 110],
        vols: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0.2)),
    });
    runtime.destroyVolSurface(handle);
    assert.throws(() => runtime.volSurfaceBlackVol(handle, "2025-04-02", 100), /unknown vol surface handle/);
    assert.doesNotThrow(() => runtime.destroyVolSurface(handle), "double destroy is a safe no-op");
});
test("linear and log-linear zero curves agree at nodes but differ between them", () => {
    const common = { evaluationDate: "2025-01-02", dates: ["2027-01-04", "2030-01-04", "2035-01-04"], zeroRates: [.03, .035, .04] };
    const linear = runtime.createZeroCurve({ ...common, interpolation: "linear" });
    const logLinear = runtime.createZeroCurve({ ...common, interpolation: "log-linear" });
    try {
        close(runtime.curveZeroRate(linear, "2027-01-04"), .03, 1e-9);
        close(runtime.curveZeroRate(logLinear, "2027-01-04"), .03, 1e-9);
        close(runtime.curveZeroRate(linear, "2035-01-04"), .04, 1e-9);
        close(runtime.curveZeroRate(logLinear, "2035-01-04"), .04, 1e-9);
        const midLinear = runtime.curveZeroRate(linear, "2028-06-30");
        const midLog = runtime.curveZeroRate(logLinear, "2028-06-30");
        assert.ok(Math.abs(midLinear - midLog) > 1e-6, "interpolated zero rates differ between schemes");
        assert.ok(midLinear > .03 && midLinear < .035, "linear midpoint sits between the surrounding nodes");
        close(runtime.curveDiscount(linear, "2035-01-04"), runtime.curveDiscount(logLinear, "2035-01-04"), 1e-9);
    } finally {
        runtime.destroyCurve(linear);
        runtime.destroyCurve(logLinear);
    }
});
test("curve extrapolation is opt-in and continuous when enabled", () => {
    const common = { evaluationDate: "2025-01-02", dates: ["2027-01-04", "2030-01-04"], zeroRates: [.03, .035] };
    const strict = runtime.createZeroCurve(common);
    const extra = runtime.createZeroCurve({ ...common, extrapolation: true });
    try {
        assert.throws(() => runtime.curveDiscount(strict, "2038-01-01"), /past max curve time/);
        assert.throws(() => runtime.curveZeroRate(strict, "2038-01-01"), /past max curve time/);
        // at and inside the last node both curves agree exactly
        close(runtime.curveZeroRate(extra, "2030-01-04"), .035, 1e-9);
        close(runtime.curveZeroRate(extra, "2027-01-04"), .03, 1e-9);
        // beyond the last node the enabled curve continues the interpolation:
        // finite, positive, and still discounting
        const farRate = runtime.curveZeroRate(extra, "2038-01-01");
        assert.ok(Number.isFinite(farRate) && farRate > .03 && farRate < .05, `extrapolated rate ${farRate}`);
        assert.ok(runtime.curveDiscount(extra, "2038-01-01") < runtime.curveDiscount(extra, "2030-01-04"));
        assert.throws(() => runtime.curveForwardRate(extra, "2030-01-04", "2027-01-04"), /after start date/);
    } finally {
        runtime.destroyCurve(strict);
        runtime.destroyCurve(extra);
    }
});
test("Brent root solver converges on a known root and rejects bad brackets", () => {
    const root = runtime.solveRoot((x) => x * x - 2, 0, 3, 1, 1e-10, 100);
    close(root, Math.SQRT2, 1e-8);
    const linear = runtime.solveRoot((x) => x - 7, 0, 10, 5, 1e-12, 100);
    close(linear, 7, 1e-8);
    assert.throws(() => runtime.solveRoot((x) => x, 5, 1, 3), /invalid root solver bounds/);
});
test("American binomial prices dominate the European value and converge with steps", () => {
    const common = { evaluationDate: "2025-01-01", maturityDate: "2026-01-01", spot: 100, strike: 100, riskFreeRate: .05, dividendYield: .01, volatility: .2, type: "call" };
    const european = runtime.priceEuropean(common);
    const american = runtime.priceAmerican({ ...common, timeSteps: 400 });
    assert.ok(american.value >= european.value - .02, `american ${american.value} >= european ${european.value}`);
    assert.ok(american.value >= Math.max(100 - 100, 0) - 1e-9, "intrinsic value respected");
    assert.ok(american.delta > 0 && american.delta < 1);
    assert.ok(Number.isFinite(american.gamma) && american.gamma > 0);
    // early exercise matters for puts: an American put beats its European twin
    const putCommon = { ...common, type: "put" };
    const euPut = runtime.priceEuropean(putCommon);
    const amPut = runtime.priceAmerican({ ...putCommon, timeSteps: 400 });
    assert.ok(amPut.value > euPut.value, `american put ${amPut.value} > european put ${euPut.value}`);
    assert.throws(() => runtime.priceAmerican({ ...common, timeSteps: 0 }), /time steps/);
});
test("vanilla swap prices to zero at its fair rate", () => {
    const make = () => runtime.createZeroCurve({
        evaluationDate: "2025-01-02",
        dates: ["2026-01-04", "2027-01-04", "2030-01-04", "2035-01-04"],
        zeroRates: [.03, .031, .033, .035],
    });
    const discount = make();
    const forward = make();
    try {
        const input = { evaluationDate: "2025-01-02", startDate: "2025-01-04", maturityDate: "2030-01-04", nominal: 1e6, fixedRate: .03, fixedMonths: 12, floatMonths: 6, spread: 0, payer: true };
        const swap = runtime.priceVanillaSwap(discount, forward, input);
        assert.ok(swap.fairRate > 0 && Number.isFinite(swap.fairRate));
        const atFair = runtime.priceVanillaSwap(discount, forward, { ...input, fixedRate: swap.fairRate });
        close(atFair.value, 0, 1e-5);
        const receiver = runtime.priceVanillaSwap(discount, forward, { ...input, payer: false });
        const payerBelowFair = runtime.priceVanillaSwap(discount, forward, { ...input, fixedRate: swap.fairRate - .01 });
        const payerAboveFair = runtime.priceVanillaSwap(discount, forward, { ...input, fixedRate: swap.fairRate + .01 });
        assert.ok(payerBelowFair.value > 0 && payerAboveFair.value < 0, "payer swap value decreases with the paid fixed rate");
        close(receiver.value, -swap.value, 1e-6, "receiver at the same rate is the mirror of the payer");
        const receiverBelowFair = runtime.priceVanillaSwap(discount, forward, { ...input, payer: false, fixedRate: swap.fairRate - .01 });
        close(receiverBelowFair.value, -payerBelowFair.value, 1e-6);
    } finally {
        runtime.destroyCurve(discount);
        runtime.destroyCurve(forward);
    }
});
test("cap and floor values are positive and monotone in strike and volatility", () => {
    const make = () => runtime.createZeroCurve({
        evaluationDate: "2025-01-02",
        dates: ["2026-01-04", "2027-01-04", "2030-01-04", "2035-01-04"],
        zeroRates: [.03, .031, .033, .035],
    });
    const discount = make();
    const forward = make();
    try {
        const base = { evaluationDate: "2025-01-02", startDate: "2025-01-04", maturityDate: "2030-01-04", nominal: 1e6, floatMonths: 6, volatility: .15 };
        const capLow = runtime.priceCapFloor(discount, forward, { ...base, strike: .02, cap: true });
        const capHigh = runtime.priceCapFloor(discount, forward, { ...base, strike: .04, cap: true });
        const capMid = runtime.priceCapFloor(discount, forward, { ...base, strike: .03, cap: true });
        const capMidHighVol = runtime.priceCapFloor(discount, forward, { ...base, strike: .03, volatility: .25, cap: true });
        const floorLow = runtime.priceCapFloor(discount, forward, { ...base, strike: .02, cap: false });
        const floorHigh = runtime.priceCapFloor(discount, forward, { ...base, strike: .04, cap: false });
        const floorMid = runtime.priceCapFloor(discount, forward, { ...base, strike: .03, cap: false });
        const floorMidHighVol = runtime.priceCapFloor(discount, forward, { ...base, strike: .03, volatility: .25, cap: false });
        assert.ok(capLow.value > 0 && floorLow.value > 0);
        assert.ok(capLow.value > capHigh.value, "lower strike cap is more valuable");
        assert.ok(floorHigh.value > floorLow.value, "higher strike floor is more valuable");
        assert.ok(capMidHighVol.value > capMid.value, "cap value rises with volatility");
        assert.ok(floorMidHighVol.value > floorMid.value, "floor value rises with volatility");
    } finally {
        runtime.destroyCurve(discount);
        runtime.destroyCurve(forward);
    }
});
test("callable and putable bonds relate to the straight bond and clean/dirty/accrued", () => {
    const discount = runtime.createZeroCurve({
        evaluationDate: "2025-01-02",
        dates: ["2026-01-04", "2027-01-04", "2030-01-04", "2035-01-04"],
        zeroRates: [.03, .031, .033, .035],
    });
    try {
        const straight = runtime.priceBondWithCurve(discount, {
            evaluationDate: "2025-01-02", issueDate: "2025-01-02", maturityDate: "2035-01-02",
            settlementDays: 0, faceAmount: 100, couponRate: .03, frequency: 2, redemption: 100,
        });
        const common = {
            evaluationDate: "2025-01-02", issueDate: "2025-01-02", maturityDate: "2035-01-02",
            settlementDays: 0, faceAmount: 100, couponRate: .03, frequency: 2, redemption: 100,
            exerciseDate: "2030-01-02", exercisePrice: 100, meanReversion: .03, shortRateVolatility: .01, timeSteps: 60,
        };
        const callable = runtime.priceCallablePutableBond(discount, { ...common, callability: true });
        const putable = runtime.priceCallablePutableBond(discount, { ...common, callability: false });
        close(callable.cleanPrice + callable.accruedAmount, callable.dirtyPrice, 1e-9);
        close(putable.cleanPrice + putable.accruedAmount, putable.dirtyPrice, 1e-9);
        assert.ok(callable.value <= straight.value + .5, `callable ${callable.value} <= straight ${straight.value}`);
        assert.ok(putable.value >= straight.value - .5, `putable ${putable.value} >= straight ${straight.value}`);
        assert.ok(Number.isFinite(callable.value) && callable.value > 0);
    } finally {
        runtime.destroyCurve(discount);
    }
});
test("QuantLib normal distribution routines match the closed forms", () => {
    close(runtime.normalCdf(0), 0.5, 1e-12);
    close(runtime.normalPdf(0), 1 / Math.sqrt(2 * Math.PI), 1e-12);
    close(runtime.normalCdf(1.96), 0.975, 1e-4);
    close(runtime.millsRatio(1), 1.5251352761609822, 1e-9);
});
