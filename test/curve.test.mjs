import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import {
  buildCurvePrompt,
  curveDurationMs,
  generateCurveRound,
  CURVE_SHOCK_LABELS,
} from "./dist/games/curve/game.js";

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

/** Re-score every position through QuantLib from the round's own curves. */
function scoreViaQuantLib(round) {
  const { evaluationDate, nodes, positions } = round;
  const nodeDates = nodes.map((node) => addMonths(evaluationDate, node.months));
  const baseHandle = ql.createZeroCurve({ evaluationDate, dates: nodeDates, zeroRates: nodes.map((node) => node.baseRate) });
  const shockedHandle = ql.createZeroCurve({ evaluationDate, dates: nodeDates, zeroRates: nodes.map((node) => node.shockedRate) });
  try {
    const inputs = positions.map((position) => ({
      issueDate: evaluationDate,
      maturityDate: position.maturityDate,
      settlementDays: 0,
      faceAmount: position.notional,
      couponRate: position.couponRate,
      frequency: 2,
      redemption: 100,
    }));
    const repriced = ql.repriceBondsBetweenCurves(baseHandle, shockedHandle, evaluationDate, inputs);
    return positions.map((position, index) => (position.side === "long" ? 1 : -1) * repriced[index].pnl);
  } finally {
    ql.destroyCurve(baseHandle);
    ql.destroyCurve(shockedHandle);
  }
}

test("QuantLib loads and the curve generator produces max-P&L rounds", () => {
  for (let seed = 1; seed <= 3000; seed += 1) {
    const round = generateCurveRound(rng(seed), ql);
    const maturities = round.positions.map((position) => position.maturityYears);
    assert.equal(new Set(maturities).size, 3, `seed=${seed}: positions must sit on distinct maturities`);
    assert.equal(round.answerIndex, round.rankings[0], `seed=${seed}: rankings[0] is the answer`);

    // the machine's answer is the max-P&L position when re-scored by QuantLib
    const pnls = scoreViaQuantLib(round);
    const bestIndex = pnls.indexOf(Math.max(...pnls));
    assert.equal(round.answerIndex, bestIndex, `seed=${seed}`);
    const winnerPnl = pnls[bestIndex];
    const sorted = [...pnls].sort((a, b) => b - a);
    assert.ok(winnerPnl > 50, `seed=${seed}: answer must have positive P&L, got ${winnerPnl}`);
    assert.ok(sorted[0] - sorted[1] > 20, `seed=${seed}: unique winner with a visible margin`);
    // the stored analysis matches the QuantLib re-score exactly
    round.positions.forEach((position, index) => {
      assert.equal(round.analysis[index].pnl, pnls[index], `seed=${seed}: stored analysis equals re-score`);
    });
  }
});

test("the user's example: a 10Y rally pays the long 10Y bond", () => {
  const evaluationDate = "2025-01-02";
  const nodeDates = ["2027-01-02", "2030-01-02", "2035-01-02"];
  // base curve 3.00% / 3.40% / 3.70%, shock: 2Y +20bp, 5Y +5bp, 10Y -10bp
  const base = ql.createZeroCurve({ evaluationDate, dates: nodeDates, zeroRates: [0.03, 0.034, 0.037] });
  const shocked = ql.createZeroCurve({ evaluationDate, dates: nodeDates, zeroRates: [0.032, 0.0345, 0.036] });
  try {
    const bond = (maturityDate, couponRate, faceAmount) => ({
      issueDate: evaluationDate, maturityDate, settlementDays: 0, faceAmount, couponRate, frequency: 2, redemption: 100,
    });
    const positions = [
      bond("2027-01-02", 0.03, 100000), // 2Y
      bond("2030-01-02", 0.034, 100000), // 5Y
      bond("2035-01-02", 0.037, 100000), // 10Y
    ];
    const repriced = ql.repriceBondsBetweenCurves(base, shocked, evaluationDate, positions);
    const pnl2Y = repriced[0].pnl;   // +20bp -> negative
    const pnl5Y = repriced[1].pnl;   // +5bp -> small negative
    const pnl10Y = repriced[2].pnl;  // -10bp -> positive and largest in magnitude
    assert.ok(pnl2Y < 0 && pnl5Y < 0 && pnl10Y > 0, `2Y ${pnl2Y}, 5Y ${pnl5Y}, 10Y ${pnl10Y}`);
    assert.ok(pnl10Y > -pnl2Y, "the 10Y move dominates despite being smaller because its DV01 is largest");
  } finally {
    ql.destroyCurve(base);
    ql.destroyCurve(shocked);
  }
});

test("positions are well-formed and pedagogically mixed", () => {
  let longCount = 0;
  let shortCount = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const round = generateCurveRound(rng(seed), ql);
    assert.equal(round.positions.length, 3);
    assert.equal(round.nodes.length, 3, `seed=${seed}: three curve nodes`);
    assert.ok(round.nodes.every((node) => node.baseRate > 0 && Number.isFinite(node.shockedRate) && node.shockedRate > 0), `seed=${seed}: positive finite rates`);
    round.positions.forEach((position) => {
      assert.ok(Number.isInteger(position.maturityYears) && position.maturityYears >= 1 && position.maturityYears <= 30, `seed=${seed}: maturity`);
      assert.ok(["long", "short"].includes(position.side), `seed=${seed}: side`);
      assert.ok([100000, 200000, 500000].includes(position.notional), `seed=${seed}: notional`);
      assert.ok(position.couponRate > 0, `seed=${seed}: coupon`);
      longCount += position.side === "long" ? 1 : 0;
      shortCount += position.side === "short" ? 1 : 0;
    });
    assert.ok(round.positions.some((p) => p.side === "long") && round.positions.some((p) => p.side === "short"), `seed=${seed}: mixed sides`);
    assert.ok(round.questionText.includes("largest P&L"));
    assert.ok(round.analysis.every((entry) => entry.dv01 > 0), `seed=${seed}: positive DV01`);
  }
  assert.ok(longCount > 0 && shortCount > 0);
});

test("every shock type and explanation factor occurs across a long run", () => {
  const shockTypes = new Set();
  const factors = new Set();
  for (let seed = 1; seed <= 4000; seed += 1) {
    const round = generateCurveRound(rng(seed), ql);
    shockTypes.add(round.shockType);
    if (round.explanation.includes("Location decided it")) factors.add("location");
    if (round.explanation.includes("Duration decided it")) factors.add("duration");
    if (round.explanation.includes("Size decided it")) factors.add("size");
    if (round.explanation.includes("Direction decided it")) factors.add("direction");
    if (round.explanation.includes("No single factor dominates")) factors.add("balance");
    assert.ok(round.explanation.includes(round.answerText), `seed=${seed}: explanation names the winner`);
    assert.ok(round.explanation.includes(round.shockDetail), `seed=${seed}: explanation names the shock`);
  }
  assert.equal(shockTypes.size, 9, "all nine shocks appear");
  assert.ok(factors.has("location"), "location rounds appear");
  assert.ok(factors.has("duration"), "duration rounds appear");
});

test("decision window shortens with streak and floors", () => {
  assert.equal(curveDurationMs(0), 10000);
  assert.ok(curveDurationMs(2) < curveDurationMs(0));
  assert.equal(curveDurationMs(50), 4500);
});

test("the AI prompt carries the curve, shock, positions and the machine answer", () => {
  const round = generateCurveRound(rng(7), ql);
  const prompt = buildCurvePrompt(round, "analyst");
  assert.ok(prompt.includes(round.shockLabel));
  assert.ok(prompt.includes(round.answerText));
  assert.ok(prompt.includes("P&L"));
  assert.ok(prompt.includes("DV01"));
  assert.ok(round.positions.every((position) => prompt.includes(position.label)), "every position label appears");
  assert.ok(prompt.includes(round.shockDetail));
});

test("every shock label is reachable from the label map", () => {
  assert.equal(Object.keys(CURVE_SHOCK_LABELS).length, 9);
});
