import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import {
  buildExoticPrompt,
  exoticDurationMs,
  generateExoticRound,
  EXOTIC_EVALUATION_DATE,
} from "./dist/games/exotic/game.js";

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

const addMonths = (iso, months) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

/** Re-price one exotic spec through QuantLib (mirrors the game's priceSpec). */
function priceSpec(round, spec, spot, vol) {
  const base = { evaluationDate: round.evaluationDate, maturityDate: round.maturityDate, riskFreeRate: 0.025, dividendYield: 0.015 };
  switch (spec.kind) {
    case "barrier":
      return ql.priceBarrier({ ...base, spot, strike: spec.strike, barrier: spec.barrier, rebate: 0, volatility: vol, type: spec.type, barrierType: spec.barrierType }).value;
    case "digital":
      return ql.priceDigital({ ...base, spot, strike: spec.strike, volatility: vol, type: spec.type, cashPayoff: spec.cashPayoff }).value;
    case "asian":
      return ql.priceAsian({ ...base, spot, strike: spec.strike, volatility: vol, type: spec.type, averageSoFar: spec.avgSoFar, pastFixings: spec.pastFixings, futureFixings: spec.futureFixings }).value;
    case "worstof": {
      const scale = spot / round.baseSpot;
      return ql.priceWorstOf({ ...base, spot1: spot, spot2: spec.spot2 * scale, dividendYield1: 0.015, dividendYield2: 0.015, volatility1: vol, volatility2: vol, correlation: spec.correlation, strike: spec.strike, type: spec.type }).value;
    }
    case "autocall": {
      const maturityDate = addMonths(round.evaluationDate, spec.maturityMonths);
      return ql.priceAutocall({ evaluationDate: round.evaluationDate, maturityDate, spot, initialSpot: 100, riskFreeRate: 0.025, dividendYield: 0.015, volatility: vol, coupon: spec.coupon, callLevel: 100, barrierLevel: spec.barrierLevel, notional: 100, observationMonths: 6, paths: 20000 }).value;
    }
    case "vanilla":
      return ql.priceEuropean({ ...base, spot, strike: spec.strike, volatility: vol, type: spec.type }).value;
  }
}

test("QuantLib loads and the exotic generator produces worst-P&L rounds", () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const round = generateExoticRound(rng(seed), ql);
    const kinds = round.positions.map((position) => position.kind);
    assert.equal(new Set(kinds).size, 4, `seed=${seed}: four distinct instrument kinds`);
    assert.equal(round.answerIndex, round.rankings[0], `seed=${seed}: rankings[0] is the answer`);

    // the machine's answer is the min-P&L position when re-scored by QuantLib
    const pnls = round.positions.map((position) =>
      priceSpec(round, position.spec, round.afterSpot, round.afterVol) - priceSpec(round, position.spec, round.baseSpot, round.baseVol));
    const worstIndex = pnls.indexOf(Math.min(...pnls));
    assert.equal(round.answerIndex, worstIndex, `seed=${seed}`);
    assert.ok(pnls[worstIndex] < -0.5, `seed=${seed}: answer must lose value, got ${pnls[worstIndex]}`);
    const sorted = [...pnls].sort((a, b) => a - b);
    assert.ok(sorted[1] - sorted[0] > 0.5, `seed=${seed}: unique loser with a visible margin`);
    // the stored analysis matches the QuantLib re-score exactly
    round.positions.forEach((position, index) => {
      assert.equal(round.pnl[index].pnl, pnls[index], `seed=${seed}: stored P&L equals re-score`);
    });
  }
});

test("positions are well-formed, long-only, and diverse", () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const round = generateExoticRound(rng(seed), ql);
    assert.equal(round.positions.length, 4);
    assert.equal(round.baseSpot, 100, `seed=${seed}: base spot is 100`);
    round.positions.forEach((position) => {
      assert.equal(position.side, "long", `seed=${seed}: long-only`);
      assert.ok(["barrier", "digital", "asian", "worstof", "autocall", "vanilla"].includes(position.kind), `seed=${seed}: kind`);
      assert.ok(position.label.startsWith("LONG "), `seed=${seed}: label`);
      assert.ok(round.pnl[round.positions.indexOf(position)].priceBefore >= 0, `seed=${seed}: non-negative price`);
    });
    assert.ok(round.questionText.includes("loses the most"));
  }
});

test("every shock type occurs across a long run", () => {
  const shocks = new Set();
  for (let seed = 1; seed <= 1000; seed += 1) {
    const round = generateExoticRound(rng(seed), ql);
    shocks.add(round.shockLabel);
    assert.ok(round.explanation.includes(round.answerText), `seed=${seed}: explanation names the loser`);
    assert.ok(round.explanation.includes("Why:"), `seed=${seed}: explanation gives a reason`);
  }
  assert.equal(shocks.size, 4, "all four shocks appear");
});

test("decision window shortens with streak and floors", () => {
  assert.equal(exoticDurationMs(0), 11000);
  assert.ok(exoticDurationMs(2) < exoticDurationMs(0));
  assert.equal(exoticDurationMs(50), 5000);
});

test("the AI prompt carries the shock, positions and the machine answer", () => {
  const round = generateExoticRound(rng(7), ql);
  const prompt = buildExoticPrompt(round, "analyst");
  assert.ok(prompt.includes(round.shockLabel));
  assert.ok(prompt.includes(round.answerText));
  assert.ok(prompt.includes("P&L"));
  assert.ok(prompt.includes("barrier") || prompt.includes("digital") || prompt.includes("average") || prompt.includes("weakest"));
  assert.ok(round.positions.every((position) => prompt.includes(position.label)), "every position label appears");
});

test("the exotic evaluation date is anchored", () => {
  assert.equal(EXOTIC_EVALUATION_DATE, "2025-01-02");
});
