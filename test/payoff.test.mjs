import test from "node:test";
import assert from "node:assert/strict";
import { bookPayoff, breakevens, payoffExtremes } from "@quantcraft/finmath";
import { generatePayoffQuestion, levelForProgress, decisionDurationMs } from "./dist/games/payoff/game.js";

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
  let valid = 0;
  for (let seed = 1; seed <= 4000; seed += 1) {
    for (let tier = 1; tier <= 5; tier += 1) {
      const question = generatePayoffQuestion(rng(seed), SEEDS, tier);
      assert.equal(new Set(question.choices.map((c) => c.label)).size, 4, `seed=${seed} tier=${tier}`);
      const answerValue = question.choices[question.answerIndex].value;
      const expected = question.type === "maxProfit" && question.answerText === "UNLIMITED" ? "unbounded" : Number(question.answerText);
      assert.equal(answerValue, expected, `seed=${seed} tier=${tier} type=${question.type}`);
      valid += 1;
    }
  }
  assert.equal(valid, 20000);
});

test("payoff-type questions match bookPayoff at the terminal spot", () => {
  let verified = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, 1);
    if (question.type === "payoff") {
      assert.equal(bookPayoff(question.legs, question.spot), question.choices[question.answerIndex].value);
      verified += 1;
    }
  }
  assert.ok(verified > 0, "expected at least one payoff-type question in 1000 draws");
});

test("max-profit questions report the book's true extreme", () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, 5);
    if (question.type !== "maxProfit") continue;
    const max = payoffExtremes(question.legs).max;
    assert.equal(question.choices[question.answerIndex].value, max);
  }
});

test("breakeven questions use the book's unique integer root", () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const question = generatePayoffQuestion(rng(seed), SEEDS, 5);
    if (question.type !== "breakeven") continue;
    const roots = breakevens(question.legs);
    assert.equal(roots.length, 1);
    assert.ok(Number.isInteger(roots[0]));
    assert.equal(question.choices[question.answerIndex].value, roots[0]);
  }
});

test("level progression advances only forward", () => {
  assert.equal(levelForProgress(0), 1);
  assert.equal(levelForProgress(1), 1);
  assert.equal(levelForProgress(2), 2);
  assert.equal(levelForProgress(4), 3);
  assert.equal(levelForProgress(6), 4);
  assert.equal(levelForProgress(8), 5);
});

test("decision window shrinks as difficulty and streak grow", () => {
  assert.ok(decisionDurationMs(1, 0) > decisionDurationMs(5, 10));
  assert.ok(decisionDurationMs(1, 0) >= 4500);
});
