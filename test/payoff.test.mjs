import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { bookPayoff, breakevens, isContinuousBook, legPayoff, normalCdf, normalPdf, payoffExtremes } from "@quantcraft/finmath";
import { generatePayoffQuestion, toTerminalLeg } from "./dist/games/payoff/game.js";

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

const SEEDS = [
  { id: "A", label: "Long call", legs: [{ kind: "call", strikeOffset: 0 }] },
  { id: "B", label: "Long put", legs: [{ kind: "put", strikeOffset: 0 }] },
  { id: "C", label: "Long forward", legs: [{ kind: "forward", strikeOffset: 0 }] },
  { id: "D", label: "Long equity", legs: [{ kind: "equity" }] },
  { id: "E", label: "Digital", legs: [{ kind: "digital", optionType: "call", strikeOffset: 0, cashPayoff: 10 }] },
  { id: "F", label: "Barrier", legs: [{ kind: "barrier", optionType: "call", strikeOffset: 0, barrierOffset: -20 }] },
  { id: "G", label: "Straddle", legs: [{ kind: "call", strikeOffset: 0 }, { kind: "put", strikeOffset: 0 }] },
  { id: "H", label: "Strangle", legs: [{ kind: "put", strikeOffset: -5 }, { kind: "call", strikeOffset: 5 }] },
  { id: "I", label: "Ladder3", legs: [{ kind: "call", strikeOffset: 0 }, { kind: "call", strikeOffset: 10 }, { kind: "call", strikeOffset: 20 }] },
  { id: "J", label: "Bond", legs: [{ kind: "bond", faceAmount: 100 }] },
  { id: "K", label: "Coupon", legs: [{ kind: "coupon", faceAmount: 100, couponRate: 5 }] },
  { id: "L", label: "Puts+Call", legs: [{ kind: "put", strikeOffset: -15 }, { kind: "put", strikeOffset: 0 }, { kind: "call", strikeOffset: 10 }] },
];

test("generator always yields 4 distinct choices with a matching answer", () => {
  for (let seed = 1; seed <= 20000; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, ql);
    assert.equal(new Set(question.choices.map((c) => c.label)).size, 4, `seed=${seed}`);
    const answerValue = question.choices[question.answerIndex].value;
    const expected = question.type === "maxProfit" && question.answerText === "UNLIMITED" ? "unbounded" : Number(question.answerText);
    assert.equal(answerValue, expected, `seed=${seed} type=${question.type}`);
  }
});

test("payoff-type questions match bookPayoff at the terminal spot", () => {
  let verified = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, ql);
    if (question.type === "payoff") {
      assert.equal(bookPayoff(question.legs, question.spot), question.choices[question.answerIndex].value);
      verified += 1;
    }
  }
  assert.ok(verified > 0, "expected at least one payoff-type question in 1000 draws");
});

test("max-profit questions report the book's true extreme", () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, ql);
    if (question.type !== "maxProfit") continue;
    const max = payoffExtremes(question.legs).max;
    assert.equal(question.choices[question.answerIndex].value, max);
  }
});

test("breakeven questions use the book's unique integer root", () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, ql);
    if (question.type !== "breakeven") continue;
    const roots = breakevens(question.legs);
    assert.equal(roots.length, 1);
    assert.ok(Number.isInteger(roots[0]));
    assert.equal(question.choices[question.answerIndex].value, roots[0]);
  }
});

test("QuantLib payoff math agrees with the pure finmath analyzers", () => {
  const legs = (extra) => ({
    kind: "call", side: "long", quantity: 1, strike: 100, optionType: "call", cashPayoff: 10,
    faceAmount: 100, couponRate: 5, barrier: 80, barrierType: "down-out", barrierTouched: false, rebate: 0, ...extra,
  });
  const books = [
    [legs({ kind: "call" })],
    [legs({ kind: "put", optionType: "put" })],
    [legs({ kind: "put" })], // regression: a put leg whose optionType was left as "call"
    [legs({ kind: "equity" })],
    [legs({ kind: "forward" })],
    [legs({ kind: "bond" })],
    [legs({ kind: "coupon" })],
    [legs({ kind: "call" }), legs({ kind: "put", optionType: "put" })],
    [legs({ kind: "put", strike: 95, optionType: "put" }), legs({ kind: "call", strike: 105 })],
    [legs({ kind: "equity" }), legs({ kind: "put", strike: 90, optionType: "put" })],
    [legs({ kind: "call", strike: 100 }), legs({ kind: "call", strike: 115 })],
    [legs({ kind: "call", side: "short", quantity: 1, strike: 100 }), legs({ kind: "call", strike: 110 })],
    [legs({ kind: "digital", cashPayoff: 10 }), legs({ kind: "call", strike: 110 })],
  ];
  for (const book of books) {
    const terminalLegs = book.map(toTerminalLeg);
    if (isContinuousBook(book)) {
      const qlExtremes = ql.payoffExtremes(terminalLegs);
      const tsExtremes = payoffExtremes(book);
      const qlMax = qlExtremes.boundedAbove ? qlExtremes.max : "unbounded";
      const qlMin = qlExtremes.boundedBelow ? qlExtremes.min : "unbounded";
      assert.equal(qlMax, tsExtremes.max, `${book.map((l) => l.kind).join("+")}: max`);
      assert.equal(qlMin, tsExtremes.min, `${book.map((l) => l.kind).join("+")}: min`);
      const qlRoots = ql.payoffBreakevens(terminalLegs);
      const tsRoots = breakevens(book);
      assert.equal(qlRoots.length, tsRoots.length, `${book.map((l) => l.kind).join("+")}: breakeven count`);
      qlRoots.forEach((root, index) => assert.ok(Math.abs(root - tsRoots[index]) < 1e-6, `${book.map((l) => l.kind).join("+")}: breakeven ${index}`));
    }
    for (const spot of [0, 1, 50, 99, 100, 101, 120, 200]) {
      const qlValue = terminalLegs.reduce((sum, leg) => sum + ql.terminalPayoff(leg, spot), 0);
      const tsValue = book.reduce((sum, leg) => sum + legPayoff(leg, spot), 0);
      assert.equal(qlValue, tsValue, `${book.map((l) => l.kind).join("+")}: payoff at ${spot}`);
    }
  }
  for (const x of [-3, -1, 0, 0.5, 1, 2, 3.5]) {
    // QuantLib's CDF is more accurate than the Abramowitz-Stegun fallback; the
    // difference is bounded by the fallback's documented ~1.5e-7 error.
    assert.ok(Math.abs(ql.normalCdf(x) - normalCdf(x)) < 2e-7, `cdf(${x})`);
    assert.ok(Math.abs(ql.normalPdf(x) - normalPdf(x)) < 1e-12, `pdf(${x})`);
  }
});

test("QuantLib-backed questions carry QuantLib-computed answers", () => {
  let payoffChecks = 0;
  let maxProfitChecks = 0;
  let breakevenChecks = 0;
  for (let seed = 1; seed <= 600; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, ql);
    if (question.type === "payoff") {
      const expected = question.legs.reduce((sum, leg) => sum + ql.terminalPayoff(toTerminalLeg(leg), question.spot), 0);
      assert.equal(question.choices[question.answerIndex].value, expected, `seed=${seed}`);
      payoffChecks += 1;
    } else if (question.type === "maxProfit") {
      const extremes = ql.payoffExtremes(question.legs.map(toTerminalLeg));
      const expected = extremes.boundedAbove ? extremes.max : "unbounded";
      assert.equal(question.choices[question.answerIndex].value, expected, `seed=${seed}`);
      maxProfitChecks += 1;
    } else {
      const roots = ql.payoffBreakevens(question.legs.map(toTerminalLeg));
      assert.equal(roots.length, 1, `seed=${seed}`);
      assert.equal(question.choices[question.answerIndex].value, roots[0], `seed=${seed}`);
      breakevenChecks += 1;
    }
  }
  assert.ok(payoffChecks > 0 && maxProfitChecks > 0 && breakevenChecks > 0, "expected a mix of question types in 600 draws");
});

