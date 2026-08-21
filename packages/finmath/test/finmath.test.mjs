import test from "node:test";
import assert from "node:assert/strict";
import {
  legPayoff,
  bookPayoff,
  breakevens,
  payoffExtremes,
} from "../dist/payoff.js";
import {
  addRisk,
  riskMagnitude,
  bestHedge,
  hedgeQuality,
  zeroRisk,
  DEFAULT_GREEK_SCALES,
  GREEK_KEYS,
  GREEK_LABELS,
} from "../dist/risk.js";
import * as finmath from "../dist/index.js";

/* ------------------------------------------------------------------ */
/* Payoff module                                                       */
/* ------------------------------------------------------------------ */

/** Minimal PayoffLeg factory mirroring the payoff module's leg schema. */
function leg(kind, side, quantity, strike, extra = {}) {
  return {
    kind,
    side,
    quantity,
    strike,
    optionType: extra.optionType ?? "call",
    cashPayoff: extra.cashPayoff ?? 10,
    faceAmount: extra.faceAmount ?? 100,
    couponRate: extra.couponRate ?? 5,
    barrier: extra.barrier ?? 80,
    barrierType: extra.barrierType ?? "down-out",
    barrierTouched: extra.barrierTouched ?? false,
    rebate: 0,
  };
}

test("LONG 1 CALL K=100 at S(T)=115 pays 15 (user example)", () => {
  assert.equal(legPayoff(leg("call", "long", 1, 100), 115), 15);
});

test("LONG 1 CALL K=100 + SHORT 1 CALL K=120 at S(T)=130 pays 20 (user example)", () => {
  const book = [leg("call", "long", 1, 100), leg("call", "short", 1, 120)];
  assert.equal(bookPayoff(book, 130), 20);
});

test("call payoffs", () => {
  assert.equal(legPayoff(leg("call", "long", 1, 100), 90), 0); // OTM
  assert.equal(legPayoff(leg("call", "short", 1, 100), 115), -15); // short ITM
  assert.equal(legPayoff(leg("call", "long", 2, 100), 115), 30); // quantity scales
});

test("put payoffs", () => {
  assert.equal(legPayoff(leg("put", "long", 1, 100), 85), 15);
  assert.equal(legPayoff(leg("put", "long", 1, 100), 115), 0);
  assert.equal(legPayoff(leg("put", "short", 2, 100), 80), -40);
});

test("forward, equity, bond and coupon payoffs", () => {
  assert.equal(legPayoff(leg("forward", "long", 1, 100), 112), 12);
  assert.equal(legPayoff(leg("forward", "short", 1, 100), 90), 10);
  assert.equal(legPayoff(leg("equity", "long", 1, 100), 115), 115);
  assert.equal(legPayoff(leg("bond", "long", 1, 100), 999), 100);
  assert.equal(legPayoff(leg("coupon", "long", 1, 100, { couponRate: 5 }), 999), 105);
});

test("digital payoffs are cash-or-nothing", () => {
  assert.equal(legPayoff(leg("digital", "long", 1, 100, { cashPayoff: 10 }), 110), 10);
  assert.equal(legPayoff(leg("digital", "long", 1, 100, { cashPayoff: 10 }), 95), 0);
  assert.equal(legPayoff(leg("digital", "long", 1, 100, { optionType: "put", cashPayoff: 15 }), 90), 15);
});

test("barrier payoffs depend on the touched fact", () => {
  const notHit = leg("barrier", "long", 1, 100, { barrier: 80, barrierTouched: false });
  const hit = leg("barrier", "long", 1, 100, { barrier: 80, barrierTouched: true });
  assert.equal(legPayoff(notHit, 115), 15); // down-out alive: plain call payoff
  assert.equal(legPayoff(hit, 115), 0); // knocked out: rebate 0
  assert.equal(legPayoff(notHit, 90), 0); // alive but OTM
});

test("bookPayoff sums signed quantities", () => {
  const book = [leg("call", "long", 1, 100), leg("call", "short", 1, 120), leg("forward", "long", 2, 100)];
  // S=130: 30 - 10 + 2*30 = 80
  assert.equal(bookPayoff(book, 130), 80);
});

test("single-instrument breakevens sit at the strike", () => {
  assert.deepEqual(breakevens([leg("call", "long", 1, 100)]), [100]);
  assert.deepEqual(breakevens([leg("put", "long", 1, 100)]), [100]);
  assert.deepEqual(breakevens([leg("forward", "long", 1, 100)]), [100]);
});

test("spread and straddle breakevens", () => {
  assert.deepEqual(breakevens([leg("call", "long", 1, 100), leg("call", "short", 1, 120)]), [100]);
  assert.deepEqual(breakevens([leg("call", "long", 1, 100), leg("put", "long", 1, 100)]), [100]);
});

test("a strangle's flat-zero region surfaces both boundary roots", () => {
  assert.deepEqual(breakevens([leg("put", "long", 1, 95), leg("call", "long", 1, 105)]), [95, 105]);
});

test("a collar whose payoff is always positive has no breakeven", () => {
  assert.deepEqual(breakevens([leg("equity", "long", 1, 0), leg("put", "long", 1, 90), leg("call", "short", 1, 110)]), []);
});

test("mixed quantities can create an interior root", () => {
  // long 1 call 100, short 3 call 125: zeros at 100 (rising) and 137.5 (falling)
  assert.deepEqual(breakevens([leg("call", "long", 1, 100), leg("call", "short", 3, 125)]), [100, 137.5]);
});

test("long positions have unbounded max profit", () => {
  assert.equal(payoffExtremes([leg("call", "long", 1, 100)]).max, "unbounded");
  assert.equal(payoffExtremes([leg("call", "long", 1, 100)]).min, 0);
});

test("short positions have unbounded min profit", () => {
  assert.equal(payoffExtremes([leg("call", "short", 1, 100)]).max, 0);
  assert.equal(payoffExtremes([leg("call", "short", 1, 100)]).min, "unbounded");
});

test("a call spread is capped at the strike width", () => {
  const spread = [leg("call", "long", 1, 100), leg("call", "short", 1, 120)];
  assert.equal(payoffExtremes(spread).max, 20);
  assert.equal(payoffExtremes(spread).min, 0);
});

test("extremes are undefined for discontinuous books", () => {
  assert.equal(payoffExtremes([leg("digital", "long", 1, 100, { cashPayoff: 10 })]), undefined);
});

/* ------------------------------------------------------------------ */
/* Risk module                                                         */
/* ------------------------------------------------------------------ */

const greeks = (delta = 0, gamma = 0, vega = 0, theta = 0, rho = 0) => ({ delta, gamma, vega, theta, rho });

test("zeroRisk starts flat and addRisk sums each Greek", () => {
  assert.deepEqual(zeroRisk(), greeks(0, 0, 0, 0, 0));
  assert.deepEqual(addRisk(greeks(1, 2, 3, 4, 5), greeks(10, 20, 30, 40, 50)), greeks(11, 22, 33, 44, 55));
});

test("riskMagnitude is the scaled Euclidean length", () => {
  assert.equal(riskMagnitude(zeroRisk()), 0);
  assert.equal(riskMagnitude(greeks(0.35, 0, 0, 0, 0)), 1); // 0.35 / 0.35
  assert.equal(riskMagnitude(greeks(0.7, 0, 0, 0, 0)), 2);
  // vega 18 at scale 18 is 1; combined with delta 0.35 -> sqrt(2)
  assert.ok(Math.abs(riskMagnitude(greeks(0.35, 0, 18, 0, 0)) - Math.SQRT2) < 1e-12);
});

test("riskMagnitude respects custom scales and key subsets", () => {
  const scales = { delta: 0.5, gamma: 0.05, vega: 20, theta: 2, rho: 20 };
  assert.equal(riskMagnitude(greeks(0.5, 0, 0, 0, 0), scales), 1);
  assert.equal(riskMagnitude(greeks(0.5, 99, 0, 0, 0), scales, ["delta"]), 1);
});

test("bestHedge returns the minimal-risk subset", () => {
  const preTrade = greeks(1, 0, 0, 0, 0); // long 1 delta -> beforeRisk = 1/0.35
  const trades = [
    { id: "sell-call", ...greeks(-0.6, -0.03, -8, 1, -2) }, // offsets delta
    { id: "sell-put", ...greeks(0.5, 0.03, -8, 1, -2) }, // increases delta
  ];
  const { bestTrades, beforeRisk, bestRisk, risk } = bestHedge({ preTrade, trades });
  assert.equal(beforeRisk, 1 / 0.35);
  assert.equal(bestTrades.length, 1);
  assert.equal(bestTrades[0].id, "sell-call");
  assert.ok(bestRisk < beforeRisk);
  assert.equal(risk(preTrade), beforeRisk);
  assert.equal(risk(addRisk(preTrade, trades[0])), bestRisk);
});

test("bestHedge with a single objective ignores other Greeks", () => {
  const preTrade = greeks(0.35, 99, 0, 0, 0);
  const trades = [{ id: "t", ...greeks(-0.175, -0.5, 0, 0, 0) }]; // delta 0.35 -> 0.175
  const { bestTrades } = bestHedge({ preTrade, trades, keys: ["delta"] });
  assert.deepEqual(bestTrades.map((trade) => trade.id), ["t"]);
});

test("bestHedge empty toolset keeps the pre-trade book", () => {
  const preTrade = greeks(1, 0, 0, 0, 0);
  const { bestTrades, bestRisk, beforeRisk } = bestHedge({ preTrade, trades: [] });
  assert.deepEqual(bestTrades, []);
  assert.equal(bestRisk, beforeRisk);
});

test("hedgeQuality scores improvement relative to the best hedge", () => {
  assert.equal(hedgeQuality({ beforeRisk: 2, chosenRisk: 1.5, bestRisk: 1 }), 0.5);
  assert.equal(hedgeQuality({ beforeRisk: 2, chosenRisk: 1, bestRisk: 1 }), 1);
  assert.equal(hedgeQuality({ beforeRisk: 2, chosenRisk: 3, bestRisk: 1 }), 0); // clamped
  // no improvement available: exact match pins to 1, otherwise 0
  assert.equal(hedgeQuality({ beforeRisk: 1, chosenRisk: 1, bestRisk: 1 }), 0);
  assert.equal(hedgeQuality({ beforeRisk: 1, chosenRisk: 1, bestRisk: 1, exactMatch: true }), 1);
});

test("GREEK_KEYS and GREEK_LABELS are aligned and scaled", () => {
  assert.equal(GREEK_KEYS.length, 5);
  GREEK_KEYS.forEach((key) => {
    assert.ok(GREEK_LABELS[key]);
    assert.ok(Number.isFinite(DEFAULT_GREEK_SCALES[key]));
  });
});

/* ------------------------------------------------------------------ */
/* Barrel re-export                                                    */
/* ------------------------------------------------------------------ */

test("the package barrel re-exports both modules", () => {
  assert.equal(typeof finmath.legPayoff, "function");
  assert.equal(typeof finmath.bestHedge, "function");
});

