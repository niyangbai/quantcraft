import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { HEDGE_SHOCKS, generateHedgeRound, settleHedge } from "./dist/games/hedge/game.js";

const moduleUrl = new URL("../packages/quantlibjs/wasm/quantlib.mjs", import.meta.url);
const wasmUrl = fileURLToPath(new URL("../packages/quantlibjs/wasm/quantlib.wasm", import.meta.url));
const ql = await QuantLibRuntime.create({ moduleUrl, wasmUrl });

/** Deterministic PRNG (mulberry32) so the generator tests are reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let v = s;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

const BANK = {
  products: [
    { name: "Capital Protected Note", description: "Zero bond + long participation call", extra: "100 face zero bond", legs: [{ type: "call", strike: 100, qty: 1 }] },
    { name: "Reverse Convertible", description: "Coupon bond + short downside put", extra: "100 face coupon bond", legs: [{ type: "put", strike: 90, qty: -1 }] },
    { name: "Capped Participation Note", description: "Bond + financed call spread", extra: "100 face zero bond", legs: [{ type: "call", strike: 100, qty: 1 }, { type: "call", strike: 120, qty: -1 }] },
    { name: "Volatility Note", description: "Bond + long straddle exposure", extra: "100 face zero bond", legs: [{ type: "call", strike: 100, qty: 1 }, { type: "put", strike: 100, qty: 1 }] },
  ],
};

test("the generator yields well-formed hedge rounds", () => {
  const shocks = new Set();
  for (let seed = 1; seed <= 1500; seed += 1) {
    const round = generateHedgeRound(rng(seed), ql, BANK);
    shocks.add(round.shock.label);
    assert.equal(round.trades.length, 6, `seed=${seed}: six trades`);
    assert.equal(new Set(round.trades.map((t) => t.id)).size, 6, `seed=${seed}: distinct trade ids`);
    assert.ok(round.objectiveKeys.length >= 1 && round.objectiveKeys.length <= 3, `seed=${seed}: objective count`);
    assert.ok(Number.isFinite(round.beforeRisk) && Number.isFinite(round.bestRisk), `seed=${seed}: finite risk`);
    assert.ok(round.bestRisk <= round.beforeRisk, `seed=${seed}: best hedge improves or holds`);
    for (const key of ["delta", "gamma", "vega", "theta", "rho"]) {
      assert.ok(Number.isFinite(round.preTrade[key]), `seed=${seed}: preTrade.${key}`);
    }
    assert.ok(round.trades.every((t) => ["long", "short"].includes(t.side)), `seed=${seed}: every trade has a side`);
    assert.ok(round.trades.every((t) => /^(LONG|SHORT) /.test(t.label)), `seed=${seed}: every trade label carries LONG/SHORT`);
  }
  assert.equal(shocks.size, HEDGE_SHOCKS.length, "all shocks appear");
});

test("selecting the exact best trades always passes", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const round = generateHedgeRound(rng(seed), ql, BANK);
    const ids = round.bestTrades.map((t) => t.id);
    const settlement = settleHedge(round, ids, 45, false);
    assert.equal(settlement.passed, true, `seed=${seed}: passed`);
    assert.ok(settlement.score >= 100, `seed=${seed}: score ${settlement.score}`);
    assert.deepEqual(settlement.bestTradeIds, ids, `seed=${seed}: bestTradeIds`);
  }
});

test("an empty selection keeps the book unchanged", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const round = generateHedgeRound(rng(seed), ql, BANK);
    const settlement = settleHedge(round, [], 45, false);
    assert.deepEqual(settlement.greeks, round.preTrade, `seed=${seed}: greeks equal preTrade`);
  }
});

test("a selected trade adds its Greeks to the book", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const round = generateHedgeRound(rng(seed), ql, BANK);
    const trade = round.trades[0];
    const settlement = settleHedge(round, [trade.id], 45, false);
    for (const key of ["delta", "gamma", "vega", "theta", "rho"]) {
      assert.equal(settlement.greeks[key], round.preTrade[key] + trade[key], `seed=${seed}: ${key}`);
    }
  }
});

test("timing out fails regardless of the selection", () => {
  const round = generateHedgeRound(rng(7), ql, BANK);
  const settlement = settleHedge(round, round.bestTrades.map((t) => t.id), 0, true);
  assert.equal(settlement.passed, false);
  assert.equal(settlement.score, -50);
  assert.equal(settlement.timedOut, true);
});
