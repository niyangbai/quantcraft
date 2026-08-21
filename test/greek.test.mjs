import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { buildGreekPrompt, displayedDirection, generateGreekQuestion, greekDirection } from "./dist/games/greek/game.js";

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
  scenarios: [
    { label: "Spot rallies", detail: "SX5E 100 → 118", spot: 118, vol: 0.2, rate: 0.025, date: "2025-01-02" },
    { label: "Spot crashes", detail: "SX5E 100 → 76", spot: 76, vol: 0.2, rate: 0.025, date: "2025-01-02" },
    { label: "Volatility jumps", detail: "Vol 20% → 38%", spot: 100, vol: 0.38, rate: 0.025, date: "2025-01-02" },
    { label: "Rates rise", detail: "EUR rate 2.5% → 4.0%", spot: 100, vol: 0.2, rate: 0.04, date: "2025-01-02" },
    { label: "Three months pass", detail: "02 Jan → 02 Apr 2025", spot: 100, vol: 0.2, rate: 0.025, date: "2025-04-02" },
  ],
  books: [
    { name: "Long ATM Call", legs: [{ type: "call", strike: 100, qty: 1 }] },
    { name: "Short ATM Put", legs: [{ type: "put", strike: 100, qty: -1 }] },
    { name: "Long Straddle", legs: [{ type: "call", strike: 100, qty: 1 }, { type: "put", strike: 100, qty: 1 }] },
    { name: "Call Spread", legs: [{ type: "call", strike: 95, qty: 1 }, { type: "call", strike: 115, qty: -1 }] },
  ],
  metrics: ["value", "delta", "gamma", "vega", "theta", "rho"],
};

/** A bank with one scenario, one book, and one metric — forces a deterministic draw. */
const singleBank = (scenario, book, metric) => ({ scenarios: [scenario], books: [book], metrics: [metric] });

test("displayedDirection and greekDirection respect displayed precision", () => {
  assert.equal(displayedDirection(1.0, 1.0001, 4), "up");
  assert.equal(displayedDirection(1.0001, 1.0, 4), "down");
  assert.equal(displayedDirection(1.0, 1.00004, 4), "unchanged");
  assert.equal(greekDirection(1.0, 1.0001), "up");
  assert.equal(greekDirection(1.0001, 1.0), "down");
  assert.equal(greekDirection(1.0, 1.00004), "unchanged");
});

test("the generator yields well-formed Greek questions", () => {
  const metrics = new Set();
  for (let seed = 1; seed <= 2000; seed += 1) {
    const q = generateGreekQuestion(rng(seed), ql, BANK);
    assert.ok(["FAIR VALUE", "DELTA", "GAMMA", "VEGA", "THETA", "RHO"].includes(q.metric), `seed=${seed}: metric ${q.metric}`);
    metrics.add(q.metric);
    assert.ok(Number.isFinite(q.before) && Number.isFinite(q.after), `seed=${seed}: finite values`);
    assert.ok(["up", "down", "unchanged"].includes(q.direction), `seed=${seed}: valid direction`);
    assert.equal(q.direction, greekDirection(q.before, q.after), `seed=${seed}: direction matches values`);
    assert.ok(q.book.legs.length >= 1, `seed=${seed}: has legs`);
    assert.equal(q.marketMove.spotDirection, displayedDirection(q.marketMove.beforeSpot, q.marketMove.afterSpot, 2), `seed=${seed}: spot direction`);
    assert.equal(q.marketMove.volatilityDirection, displayedDirection(q.marketMove.beforeVolatility * 100, q.marketMove.afterVolatility * 100, 1), `seed=${seed}: vol direction`);
    assert.equal(q.marketMove.rateDirection, displayedDirection(q.marketMove.beforeRate * 100, q.marketMove.afterRate * 100, 2), `seed=${seed}: rate direction`);
  }
  assert.equal(metrics.size, 6, "all six metrics appear");
});

test("a spot rally raises a long call's value and delta", () => {
  const rally = { label: "Spot rallies", detail: "spot up", spot: 118, vol: 0.2, rate: 0.025, date: "2025-01-02" };
  const longCall = { name: "Long call", legs: [{ type: "call", strike: 100, qty: 1 }] };
  for (let seed = 1; seed <= 300; seed += 1) {
    assert.equal(generateGreekQuestion(rng(seed), ql, singleBank(rally, longCall, "value")).direction, "up", `value seed=${seed}`);
    assert.equal(generateGreekQuestion(rng(seed), ql, singleBank(rally, longCall, "delta")).direction, "up", `delta seed=${seed}`);
  }
});

test("a spot crash lowers a long call's value and delta", () => {
  const crash = { label: "Spot crashes", detail: "spot down", spot: 76, vol: 0.2, rate: 0.025, date: "2025-01-02" };
  const longCall = { name: "Long call", legs: [{ type: "call", strike: 100, qty: 1 }] };
  for (let seed = 1; seed <= 300; seed += 1) {
    assert.equal(generateGreekQuestion(rng(seed), ql, singleBank(crash, longCall, "value")).direction, "down", `value seed=${seed}`);
    assert.equal(generateGreekQuestion(rng(seed), ql, singleBank(crash, longCall, "delta")).direction, "down", `delta seed=${seed}`);
  }
});

test("the AI prompt carries the metric, book, and direction", () => {
  const rally = { label: "Spot rallies", detail: "spot up", spot: 118, vol: 0.2, rate: 0.025, date: "2025-01-02" };
  const longCall = { name: "Long call", legs: [{ type: "call", strike: 100, qty: 1 }] };
  const q = generateGreekQuestion(rng(7), ql, singleBank(rally, longCall, "delta"));
  const prompt = buildGreekPrompt(q, "analyst");
  assert.ok(prompt.includes("DELTA"), "prompt names the metric");
  assert.ok(prompt.includes("Long call"), "prompt names the book");
  assert.ok(prompt.includes("up"), "prompt names the direction");
  assert.ok(prompt.includes("ANALYST"), "prompt names the difficulty");
});
