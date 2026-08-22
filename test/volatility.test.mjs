import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { applyVolShock } from "@quantcraft/finmath";
import {
  buildVolGrid,
  buildVolatilityPrompt,
  generateVolatilityRound,
  volatilityDurationMs,
  volSurfaceDate,
} from "./dist/games/volatility/game.js";

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

const EXPIRY_T = [1 / 12, 0.25, 0.5, 1];

/** Re-score every position through QuantLib from the round's own grid. */
function scoreViaQuantLib(round) {
  const { evaluationDate, expiries, strikes } = round.grid;
  const baseHandle = ql.createVolSurface({ evaluationDate, expiries, strikes, vols: round.grid.baseVols });
  const shockedHandle = ql.createVolSurface({ evaluationDate, expiries, strikes, vols: round.grid.shockedVols });
  try {
    return round.positions.map((position) => {
      const maturityDate = volSurfaceDate(position.expiry);
      const ivBefore = ql.volSurfaceBlackVol(baseHandle, maturityDate, position.strike);
      const ivAfter = ql.volSurfaceBlackVol(shockedHandle, maturityDate, position.strike);
      const vegaPerPoint = ql.priceEuropeanUnderSurface(baseHandle, {
        evaluationDate,
        maturityDate,
        spot: round.spot,
        strike: position.strike,
        riskFreeRate: round.surface.riskFreeRate,
        dividendYield: round.surface.dividendYield,
        type: position.kind,
      }).vega / 100;
      const signedQty = position.side === "long" ? position.qty : -position.qty;
      return signedQty * vegaPerPoint * (ivAfter - ivBefore) * 100;
    });
  } finally {
    ql.destroyVolSurface(baseHandle);
    ql.destroyVolSurface(shockedHandle);
  }
}

test("QuantLib loads and the volatility generator produces max-P&L rounds", () => {
  for (let seed = 1; seed <= 3000; seed += 1) {
    const round = generateVolatilityRound(rng(seed), ql);
    const cells = round.positions.map((position) => `${position.strike}-${position.expiry}`);
    assert.equal(new Set(cells).size, 3, `seed=${seed}: positions must sit on distinct strike×expiry cells`);
    assert.equal(round.answerIndex, round.rankings[0], `seed=${seed}: rankings[0] is the answer`);

    // the machine's answer is the max-P&L position when re-scored by QuantLib
    const pnls = scoreViaQuantLib(round);
    const bestIndex = pnls.indexOf(Math.max(...pnls));
    assert.equal(round.answerIndex, bestIndex, `seed=${seed}`);
    const winnerPnl = pnls[bestIndex];
    const sorted = [...pnls].sort((a, b) => b - a);
    assert.ok(winnerPnl > 0.02, `seed=${seed}: answer must have positive vol P&L, got ${winnerPnl}`);
    assert.ok(sorted[0] - sorted[1] > 0.004, `seed=${seed}: unique winner with a visible margin`);
    // the stored analysis matches the QuantLib re-score exactly
    round.positions.forEach((position, index) => {
      assert.equal(round.analysis[index].pnl, pnls[index], `seed=${seed}: stored analysis equals re-score`);
    });
  }
});

test("the user's example: skew steepening makes the long low-strike put the winner", () => {
  const surface = { spot: 100, riskFreeRate: 0.025, dividendYield: 0.015, atmLevel: 0.22, termSlope: 0.05, skew: -0.5, curvature: 0.9 };
  const shocked = applyVolShock(surface, { type: "skew-steepen", magnitude: 0.15 });
  const grid = buildVolGrid(surface, shocked);
  const base = ql.createVolSurface({ ...grid, vols: grid.baseVols });
  const shk = ql.createVolSurface({ ...grid, vols: grid.shockedVols });
  try {
    const date = volSurfaceDate("3M");
    const at = (strike, kind) => {
      const ivBefore = ql.volSurfaceBlackVol(base, date, strike);
      const ivAfter = ql.volSurfaceBlackVol(shk, date, strike);
      const vegaPerPoint = ql.priceEuropeanUnderSurface(base, {
        evaluationDate: grid.evaluationDate, maturityDate: date, spot: 100, strike,
        riskFreeRate: 0.025, dividendYield: 0.015, type: kind,
      }).vega / 100;
      return { delta: (ivAfter - ivBefore) * 100, pnl: vegaPerPoint * (ivAfter - ivBefore) * 100 };
    };
    const put85 = at(85, "put");
    const call100 = at(100, "call");
    const call115 = at(115, "call");
    // the ATM point is untouched by a skew pivot; the low strike gains, the high strike loses
    assert.ok(Math.abs(call100.pnl) < 1e-9, `ATM call stays flat, got ${call100.pnl}`);
    assert.ok(put85.pnl > 0.05 && call115.pnl < -0.02, `put85 ${put85.pnl}, call115 ${call115.pnl}`);
    assert.ok(put85.pnl > call100.pnl && put85.pnl > call115.pnl, "the long low-strike put wins");
  } finally {
    ql.destroyVolSurface(base);
    ql.destroyVolSurface(shk);
  }
});

test("positions are well-formed and pedagogically mixed", () => {
  let longCount = 0;
  let shortCount = 0;
  let callCount = 0;
  let putCount = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const round = generateVolatilityRound(rng(seed), ql);
    assert.ok(round.spot >= 80 && round.spot <= 120, `seed=${seed}: spot in range`);
    assert.equal(round.positions.length, 3);
    assert.equal(round.grid.baseVols.length, 4, `seed=${seed}: grid rows are the four listed expiries`);
    assert.equal(round.grid.baseVols[0].length, round.grid.strikes.length, `seed=${seed}: grid columns are the listed strikes`);
    assert.ok(round.grid.strikes.every((strike, i) => i === 0 || strike > round.grid.strikes[i - 1]), `seed=${seed}: strikes ascending`);
    round.positions.forEach((position) => {
      const index = round.positions.indexOf(position);
      assert.ok(["call", "put"].includes(position.kind), `seed=${seed}: kind`);
      assert.ok(["long", "short"].includes(position.side), `seed=${seed}: side`);
      assert.ok([1, 2].includes(position.qty), `seed=${seed}: qty`);
      assert.ok(EXPIRY_T.includes(position.maturity), `seed=${seed}: maturity`);
      assert.ok(Math.abs(Math.log(position.strike / round.spot)) <= 0.21, `seed=${seed}: strike near spot`);
      assert.ok(round.analysis[index].ivBefore >= 0.02, `seed=${seed}: sane IV`);
      longCount += position.side === "long" ? 1 : 0;
      shortCount += position.side === "short" ? 1 : 0;
      callCount += position.kind === "call" ? 1 : 0;
      putCount += position.kind === "put" ? 1 : 0;
    });
    assert.ok(round.positions.some((p) => p.side === "long") && round.positions.some((p) => p.side === "short"), `seed=${seed}: mixed sides`);
    assert.ok(round.positions.some((p) => p.kind === "call") && round.positions.some((p) => p.kind === "put"), `seed=${seed}: mixed kinds`);
    assert.ok(round.questionText.includes("largest positive vol P&L"));
  }
  assert.ok(longCount > 0 && shortCount > 0 && callCount > 0 && putCount > 0);
});

test("every shock type and explanation factor occurs across a long run", () => {
  const shockTypes = new Set();
  const factors = new Set();
  for (let seed = 1; seed <= 4000; seed += 1) {
    const round = generateVolatilityRound(rng(seed), ql);
    shockTypes.add(round.shock.type);
    if (round.explanation.includes("Location decided it")) factors.add("location");
    if (round.explanation.includes("Vega decided it")) factors.add("vega");
    if (round.explanation.includes("Side decided it")) factors.add("side");
    if (round.explanation.includes("Size decided it")) factors.add("size");
    if (round.explanation.includes("No single factor dominates")) factors.add("balance");
    assert.ok(round.explanation.includes(round.answerText), `seed=${seed}: explanation names the winner`);
    assert.ok(round.explanation.includes(round.shockDetail), `seed=${seed}: explanation names the shock`);
  }
  assert.equal(shockTypes.size, 6, "all six shocks appear");
  assert.ok(factors.has("location"), "location rounds appear");
  assert.ok(factors.has("vega"), "vega rounds appear");
  assert.ok(factors.has("side"), "side rounds appear");
});

test("decision window shortens with streak and floors", () => {
  assert.equal(volatilityDurationMs(0), 10000);
  assert.ok(volatilityDurationMs(2) < volatilityDurationMs(0));
  assert.equal(volatilityDurationMs(50), 4500);
});

test("the AI prompt carries the surface, shock, positions and the machine answer", () => {
  const round = generateVolatilityRound(rng(7), ql);
  const prompt = buildVolatilityPrompt(round, "vp");
  assert.ok(prompt.includes(`spot ${round.spot}`));
  assert.ok(prompt.includes(round.shockLabel));
  assert.ok(prompt.includes(round.answerText));
  assert.ok(prompt.includes("vol P&L"));
  assert.ok(prompt.includes("vega"));
  assert.ok(round.positions.every((position) => prompt.includes(position.id)), "every position letter appears");
  assert.ok(prompt.includes(round.surface.skew.toFixed(2)), "the base skew appears");
});
