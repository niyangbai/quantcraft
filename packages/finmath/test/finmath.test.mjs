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
import {
  matchMarketOrder,
  bestBid,
  bestAsk,
  spread,
  mid,
  depthAt,
} from "../dist/orderbook.js";
import { analyzeQuote, bestQuote, normalCdf } from "../dist/marketmaking.js";
import {
  blackVol,
  applyVolShock,
  deltaIV,
  bsmVegaPerPoint,
  analyzeVolPnl,
  termBumpAt,
} from "../dist/volsurface.js";
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

/* ------------------------------------------------------------------ */
/* Orderbook module                                                    */
/* ------------------------------------------------------------------ */

const bookFixture = () => ({
  bids: [
    { price: 10002, size: 250 }, // 100.02 best bid
    { price: 10000, size: 400 }, // 100.00
  ],
  asks: [
    { price: 10004, size: 150 }, // 100.04 best ask
    { price: 10006, size: 200 }, // 100.06
  ],
});

test("book quotes", () => {
  const book = bookFixture();
  assert.equal(bestBid(book), 10002);
  assert.equal(bestAsk(book), 10004);
  assert.equal(spread(book), 2);
  assert.equal(mid(book), 10003);
  assert.equal(depthAt(book, "ask", 10004), 150);
  assert.equal(depthAt(book, "ask", 10005), 0);
  assert.equal(depthAt(book, "bid", 10000), 400);
});

test("market buy fills asks in price-time priority (user example)", () => {
  const result = matchMarketOrder(bookFixture(), "buy", 200);
  // 150 @ 100.04 then 50 @ 100.06; VWAP = 100.045
  assert.deepEqual(result.fills, [
    { price: 10004, size: 150 },
    { price: 10006, size: 50 },
  ]);
  assert.equal(result.filledSize, 200);
  assert.equal(result.remainingSize, 0);
  assert.equal(result.averagePrice, 10004.5);
  // the 100.04 ask is gone; 100.06 now has 150 left
  assert.equal(bestAsk(result.book), 10006);
  assert.equal(depthAt(result.book, "ask", 10006), 150);
  assert.equal(depthAt(result.book, "ask", 10004), 0);
  // bids untouched
  assert.equal(bestBid(result.book), 10002);
});

test("market buy that exactly clears the best ask", () => {
  const result = matchMarketOrder(bookFixture(), "buy", 150);
  assert.deepEqual(result.fills, [{ price: 10004, size: 150 }]);
  assert.equal(bestAsk(result.book), 10006);
  assert.equal(depthAt(result.book, "ask", 10006), 200);
});

test("market sell consumes bids best-first", () => {
  const result = matchMarketOrder(bookFixture(), "sell", 300);
  assert.deepEqual(result.fills, [
    { price: 10002, size: 250 },
    { price: 10000, size: 50 },
  ]);
  assert.equal(bestBid(result.book), 10000);
  assert.equal(depthAt(result.book, "bid", 10000), 350);
  assert.equal(result.averagePrice, (250 * 10002 + 50 * 10000) / 300);
  // asks untouched
  assert.equal(bestAsk(result.book), 10004);
});

test("partial fill keeps the level at reduced size", () => {
  const result = matchMarketOrder(bookFixture(), "buy", 100);
  assert.deepEqual(result.fills, [{ price: 10004, size: 100 }]);
  assert.equal(bestAsk(result.book), 10004); // still the best ask
  assert.equal(depthAt(result.book, "ask", 10004), 50);
});

test("book exhaustion leaves remainingSize and the other side intact", () => {
  const thin = { bids: [{ price: 10000, size: 100 }], asks: [{ price: 10004, size: 50 }] };
  const result = matchMarketOrder(thin, "buy", 200);
  assert.equal(result.filledSize, 50);
  assert.equal(result.remainingSize, 150);
  assert.equal(result.book.asks.length, 0);
  assert.deepEqual(result.book.bids, thin.bids); // buyers only touch asks
});

test("matching does not mutate the input book", () => {
  const book = bookFixture();
  matchMarketOrder(book, "buy", 200);
  assert.equal(depthAt(book, "ask", 10004), 150);
  assert.equal(bestAsk(book), 10004);
});

/* ------------------------------------------------------------------ */
/* Marketmaking module                                                 */
/* ------------------------------------------------------------------ */

test("normalCdf is sane", () => {
  assert.equal(normalCdf(0), 0.5);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(normalCdf(-1) < 0.2 && normalCdf(-1) > 0.15);
});

const mmCtx = (inventory, uncertainty = 0.15, riskAversion = 0.05) => ({ fairValue: 100, inventory, uncertainty, riskAversion });

test("wider quotes fill less often", () => {
  const tight = analyzeQuote({ bid: 99.95, ask: 100.05 }, mmCtx(0));
  const wide = analyzeQuote({ bid: 99.90, ask: 100.10 }, mmCtx(0));
  assert.ok(wide.fillProbability < tight.fillProbability);
});

test("fill probability decays with distance in sigma units", () => {
  const oneSigma = analyzeQuote({ bid: 99.85, ask: 100.15 }, mmCtx(0));
  const halfSigma = analyzeQuote({ bid: 99.925, ask: 100.075 }, mmCtx(0));
  assert.ok(oneSigma.fillProbabilitySell < halfSigma.fillProbabilitySell);
  assert.ok(oneSigma.fillProbabilitySell > 0.01 && oneSigma.fillProbabilitySell < 0.2);
});

test("adverse selection is positive whenever fills happen", () => {
  const analysis = analyzeQuote({ bid: 99.95, ask: 100.05 }, mmCtx(0));
  assert.ok(analysis.adverseSelection > 0);
});

test("long inventory prefers a sell-lean quote over its buy-lean mirror", () => {
  const sellLean = analyzeQuote({ bid: 99.92, ask: 100.04 }, mmCtx(8));
  const buyLean = analyzeQuote({ bid: 99.96, ask: 100.08 }, mmCtx(8));
  assert.ok(sellLean.fillProbabilitySell > buyLean.fillProbabilitySell);
  assert.ok(sellLean.utility > buyLean.utility);
});

test("short inventory prefers a buy-lean quote over its sell-lean mirror", () => {
  const buyLean = analyzeQuote({ bid: 99.96, ask: 100.08 }, mmCtx(-8));
  const sellLean = analyzeQuote({ bid: 99.92, ask: 100.04 }, mmCtx(-8));
  assert.ok(buyLean.utility > sellLean.utility);
});

test("selling de-risks a long and inflames a short", () => {
  const long = analyzeQuote({ bid: 99.92, ask: 100.04 }, mmCtx(8));
  const short = analyzeQuote({ bid: 99.92, ask: 100.04 }, mmCtx(-8));
  assert.ok(long.inventoryPenalty < 0, "a long is rewarded for selling");
  assert.ok(short.inventoryPenalty > 0, "a short is penalized for selling");
});

test("over-tight quotes lose to a balanced spread (adverse selection)", () => {
  const tight = analyzeQuote({ bid: 99.96, ask: 100.04 }, mmCtx(0));
  const balanced = analyzeQuote({ bid: 99.92, ask: 100.08 }, mmCtx(0));
  assert.ok(balanced.utility > tight.utility);
});

test("aggressive quotes still produce finite utilities", () => {
  const analysis = analyzeQuote({ bid: 99.99, ask: 100.01 }, mmCtx(4, 0.05));
  assert.ok(Number.isFinite(analysis.utility));
  assert.ok(analysis.fillProbability > 0.5);
});

test("bestQuote returns the maximum-utility candidate", () => {
  const candidates = [
    { bid: 99.95, ask: 100.05 },
    { bid: 99.90, ask: 100.10 },
    { bid: 99.97, ask: 100.03 },
    { bid: 99.92, ask: 100.08 },
  ];
  const result = bestQuote(candidates, mmCtx(8));
  const utilities = candidates.map((quote) => analyzeQuote(quote, mmCtx(8)).utility);
  assert.equal(result.analysis.utility, Math.max(...utilities));
  assert.equal(result.rankings.length, 4);
  assert.ok(result.rankings[0].utility >= result.rankings[1].utility && result.rankings[1].utility >= result.rankings[2].utility);
});



/* ------------------------------------------------------------------ */
/* Vol surface module                                                  */
/* ------------------------------------------------------------------ */

const vsBase = () => ({ spot: 100, riskFreeRate: 0.025, dividendYield: 0.015, atmLevel: 0.22, termSlope: 0.05, skew: -0.5, curvature: 0.9 });

test("blackVol matches the closed form and stays above the floor", () => {
  const surface = vsBase();
  const t = 0.25;
  const strike = 85;
  const m = Math.log(strike / surface.spot);
  const expected = Math.max(0.02, surface.atmLevel + surface.termSlope * t + surface.skew * m + surface.curvature * m * m);
  assert.ok(Math.abs(blackVol(surface, t, strike) - expected) < 1e-12);
  // a far OTM strike on a skew surface clamps to the floor
  const flatSmile = { ...vsBase(), curvature: 0 };
  assert.equal(blackVol(flatSmile, 0.25, 300), 0.02);
});

test("deltaIV for a skew shock is exactly -magnitude * ln(K/S)", () => {
  const surface = vsBase();
  const shocked = applyVolShock(surface, { type: "skew-steepen", magnitude: 0.15 });
  for (const strike of [80, 90, 100, 110, 120]) {
    const m = Math.log(strike / surface.spot);
    const expected = -0.15 * m;
    assert.ok(Math.abs(deltaIV(surface, shocked, 0.25, strike) - expected) < 1e-12, `strike=${strike}`);
  }
  // smile-up moves wings by +magnitude * m^2 and leaves ATM alone
  const smile = applyVolShock(surface, { type: "smile-up", magnitude: 0.3 });
  const m85 = Math.log(85 / 100);
  assert.ok(Math.abs(deltaIV(surface, smile, 0.25, 85) - 0.3 * m85 * m85) < 1e-12);
  assert.ok(Math.abs(deltaIV(surface, smile, 0.25, 100)) < 1e-12);
});

test("term bumps fade (front) or build (back) with maturity", () => {
  const surface = vsBase();
  const front = applyVolShock(surface, { type: "front-vol-up", magnitude: 0.03 });
  const back = applyVolShock(surface, { type: "back-vol-up", magnitude: 0.03 });
  assert.ok(termBumpAt(front.termBump, 1 / 12) > termBumpAt(front.termBump, 1));
  assert.ok(termBumpAt(back.termBump, 1) > termBumpAt(back.termBump, 1 / 12));
  assert.equal(termBumpAt(undefined, 0.25), 0);
  assert.ok(blackVol(front, 1 / 12, 100) > blackVol(surface, 1 / 12, 100));
  assert.ok(blackVol(back, 1, 100) > blackVol(surface, 1, 100));
});

test("applyVolShock never mutates the input surface", () => {
  const surface = vsBase();
  const snapshot = JSON.stringify(surface);
  applyVolShock(surface, { type: "skew-steepen", magnitude: 0.1 });
  applyVolShock(surface, { type: "front-vol-up", magnitude: 0.02 });
  assert.equal(JSON.stringify(surface), snapshot);
});

test("BSM vega: ATM dominates OTM, longer maturities carry more, calls = puts", () => {
  const vega = (strike, t, kind) => analyzeVolPnl(vsBase(), vsBase(), { kind, strike, maturity: t, side: "long", qty: 1 }).vegaPerPoint;
  const atm3m = vega(100, 0.25, "call");
  const atm1y = vega(100, 1, "put");
  const otm3m = vega(85, 0.25, "call");
  assert.ok(atm3m > 0 && otm3m > 0);
  assert.ok(atm1y > atm3m, "longer maturity carries more vega");
  assert.ok(atm3m > otm3m, "ATM options are the most vol-sensitive");
  // calls and puts share vega exactly
  assert.equal(vega(100, 0.25, "call"), vega(100, 0.25, "put"));
  assert.equal(vega(85, 1, "call"), vega(85, 1, "put"));
  // analyzeVolPnl's vega equals the standalone closed form at the surface IV
  const atmIv = blackVol(vsBase(), 0.25, 100);
  const direct = bsmVegaPerPoint({ spot: 100, strike: 100, maturity: 0.25, riskFreeRate: 0.025, dividendYield: 0.015, volatility: atmIv });
  assert.ok(Math.abs(direct - vega(100, 0.25, "call")) < 1e-12);
  // sanity vs the textbook ATM formula S * e^{-qT} * phi(0) * sqrt(T) / 100
  const approx = (100 * Math.exp(-0.015 * 0.25) * (1 / Math.sqrt(2 * Math.PI)) * Math.sqrt(0.25)) / 100;
  assert.ok(Math.abs(atm3m - approx) < 0.005, `ATM vega ${atm3m} near ${approx}`);
});

test("vol P&L = signedQty × vega × ΔIV, zero at ATM for a pivot shock", () => {
  const base = vsBase();
  const shocked = applyVolShock(base, { type: "skew-steepen", magnitude: 0.15 });
  const long85 = analyzeVolPnl(base, shocked, { kind: "put", strike: 85, maturity: 0.25, side: "long", qty: 1 });
  assert.ok(long85.pnl > 0);
  assert.ok(Math.abs(long85.pnl - long85.vegaPerPoint * long85.deltaIVPoints) < 1e-12);
  // double the size doubles the P&L; flipping the side flips the sign
  const double = analyzeVolPnl(base, shocked, { kind: "put", strike: 85, maturity: 0.25, side: "long", qty: 2 });
  const short = analyzeVolPnl(base, shocked, { kind: "put", strike: 85, maturity: 0.25, side: "short", qty: 1 });
  assert.ok(Math.abs(double.pnl - 2 * long85.pnl) < 1e-12);
  assert.equal(short.pnl, -long85.pnl);
  const atm = analyzeVolPnl(base, shocked, { kind: "call", strike: 100, maturity: 0.25, side: "long", qty: 1 });
  assert.ok(Math.abs(atm.pnl) < 1e-12);
});

test("shocks are deterministic: identical inputs give identical outputs", () => {
  const a = analyzeVolPnl(vsBase(), applyVolShock(vsBase(), { type: "front-vol-up", magnitude: 0.03 }), { kind: "call", strike: 95, maturity: 0.5, side: "short", qty: 2 });
  const b = analyzeVolPnl(vsBase(), applyVolShock(vsBase(), { type: "front-vol-up", magnitude: 0.03 }), { kind: "call", strike: 95, maturity: 0.5, side: "short", qty: 2 });
  assert.deepEqual(a, b);
});




/* ------------------------------------------------------------------ */
/* Barrel re-export                                                    */
/* ------------------------------------------------------------------ */

test("the package barrel re-exports every module", () => {
  assert.equal(typeof finmath.legPayoff, "function");
  assert.equal(typeof finmath.bestHedge, "function");
  assert.equal(typeof finmath.matchMarketOrder, "function");
  assert.equal(typeof finmath.bestAsk, "function");
  assert.equal(typeof finmath.analyzeQuote, "function");
  assert.equal(typeof finmath.bestQuote, "function");
  assert.equal(typeof finmath.analyzeVolPnl, "function");
  assert.equal(typeof finmath.blackVol, "function");
  assert.equal(typeof finmath.applyVolShock, "function");
});
