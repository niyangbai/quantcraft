import test from "node:test";
import assert from "node:assert/strict";
import { legPayoff, bookPayoff, breakevens, payoffExtremes } from "./dist/payoff.js";
import { generatePayoffQuestion, levelForProgress, decisionDurationMs } from "./dist/payoffGame.js";

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

/** Minimal PayoffLeg factory mirroring the game's leg schema. */
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

/* ------------------------------------------------------------------ */
/* Single-instrument terminal payoffs                                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Book payoff = sum of signed leg payoffs                             */
/* ------------------------------------------------------------------ */

test("bookPayoff sums signed quantities", () => {
  const book = [leg("call", "long", 1, 100), leg("call", "short", 1, 120), leg("forward", "long", 2, 100)];
  // S=130: 30 - 10 + 2*30 = 80
  assert.equal(bookPayoff(book, 130), 80);
});

/* ------------------------------------------------------------------ */
/* Breakevens                                                          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Maximum / minimum profit                                            */
/* ------------------------------------------------------------------ */

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
/* Question generator                                                  */
/* ------------------------------------------------------------------ */

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

