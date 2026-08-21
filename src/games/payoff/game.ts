// games/payoff/game.ts — business logic for the Payoff drill.
// This module owns the question seeds, how questions are generated, how
// difficulty ramps (1 leg -> 2 legs -> 3 legs -> quantity -> long/short
// mixed), how distractors are chosen, and the AI tutor prompt. The payoff
// math itself lives in @quantcraft/finmath (payoff). No React, no storage.

import { bookPayoff, breakevens, isContinuousBook, legPayoff, payoffExtremes, signedQuantity } from "@quantcraft/finmath";
import type { PayoffBarrierType, PayoffExtremes, PayoffKind, PayoffLeg, PayoffSide } from "@quantcraft/finmath";
import type { QuantLibRuntime, TerminalPayoffInput } from "@quantcraft/quantlibjs";

export type PayoffTier = 1 | 2 | 3 | 4 | 5;
export type PayoffQuestionType = "payoff" | "maxProfit" | "breakeven";

export type PayoffLegSeed = {
  kind: PayoffKind;
  optionType?: "call" | "put";
  strikeOffset?: number;
  cashPayoff?: number;
  faceAmount?: number;
  couponRate?: number;
  barrierOffset?: number;
  barrierType?: PayoffBarrierType;
};

export type PayoffSeed = {
  id: string;
  label: string;
  legs: PayoffLegSeed[];
};

export type PayoffChoice = { label: string; hint: string; value: number | "unbounded" };

export type PayoffQuestion = {
  seed: PayoffSeed;
  tier: PayoffTier;
  type: PayoffQuestionType;
  legs: PayoffLeg[];
  spot: number;
  levelLabel: string;
  typeLabel: string;
  questionText: string;
  scenarioText: string;
  bookSummary: string;
  choices: PayoffChoice[];
  answerIndex: number;
  answerText: string;
  explanation: string;
};

/* ------------------------------------------------------------------ */
/* QuantLib-backed payoff math                                         */
/* ------------------------------------------------------------------ */
/* The terminal-payoff / extremes / breakevens math runs in the QuantLib
   layer (C++ bindings). When a runtime is available the drill routes every
   number through it; the pure-TypeScript finmath versions are the fallback. */

export const toTerminalLeg = (leg: PayoffLeg): TerminalPayoffInput => ({
  kind: leg.kind,
  quantity: signedQuantity(leg),
  strike: leg.strike,
  call: leg.optionType === "call",
  cashPayoff: leg.cashPayoff,
  redemption: leg.faceAmount,
  couponRate: leg.couponRate / 100,
  rebate: leg.rebate,
  barrierTouched: leg.barrierTouched,
  barrierType: leg.barrierType,
});

const qlPayoffExtremes = (ql: QuantLibRuntime, legs: PayoffLeg[]): PayoffExtremes | undefined => {
  try {
    const result = ql.payoffExtremes(legs.map(toTerminalLeg));
    return {
      min: result.boundedBelow ? result.min : "unbounded",
      max: result.boundedAbove ? result.max : "unbounded",
    };
  } catch {
    return undefined;
  }
};

const qlPayoffBreakevens = (ql: QuantLibRuntime, legs: PayoffLeg[]): number[] => {
  try {
    return ql.payoffBreakevens(legs.map(toTerminalLeg));
  } catch {
    return [];
  }
};

/* ------------------------------------------------------------------ */
/* Random helpers (stateless; the caller passes a seeded rng)          */
/* ------------------------------------------------------------------ */

const range = (rng: () => number, min: number, max: number): number => min + rng() * (max - min);
const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
const integer = (rng: () => number, min: number, max: number): number => Math.round(range(rng, min, max));
const chance = (rng: () => number, probability: number): boolean => rng() < probability;

const shuffle = <T,>(rng: () => number, items: readonly T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

/* ------------------------------------------------------------------ */
/* Difficulty ramp: 1 leg -> 2 legs -> 3 legs -> quantity -> mixed     */
/* ------------------------------------------------------------------ */

export const levelLabel = (tier: PayoffTier): string =>
  tier === 1 ? "1 LEG · LONG"
    : tier === 2 ? "2 LEGS · LONG"
      : tier === 3 ? "3 LEGS · LONG"
        : tier === 4 ? "QUANTITY"
          : "LONG / SHORT MIXED";

/** Level advances after every two correct answers and never regresses. */
export const levelForProgress = (correctCount: number): PayoffTier =>
  Math.min(5, 1 + Math.floor(correctCount / 2)) as PayoffTier;

/** Decision window: shorter at higher levels and on longer streaks. */
export const decisionDurationMs = (tier: PayoffTier, streak: number): number =>
  Math.max(4500, 10000 - (tier - 1) * 1200 - streak * 250);

const TYPE_WEIGHTS: Record<PayoffTier, [PayoffQuestionType, number][]> = {
  1: [["payoff", 70], ["maxProfit", 15], ["breakeven", 15]],
  2: [["payoff", 70], ["maxProfit", 15], ["breakeven", 15]],
  3: [["payoff", 60], ["maxProfit", 20], ["breakeven", 20]],
  4: [["payoff", 55], ["maxProfit", 25], ["breakeven", 20]],
  5: [["payoff", 50], ["maxProfit", 25], ["breakeven", 25]],
};

const pickType = (rng: () => number, tier: PayoffTier): PayoffQuestionType => {
  const weights = TYPE_WEIGHTS[tier];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [type, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return "payoff";
};

/* ------------------------------------------------------------------ */
/* Leg materialization                                                 */
/* ------------------------------------------------------------------ */

const buildLegs = (seed: PayoffSeed, rng: () => number, tier: PayoffTier, baseSpot: number): PayoffLeg[] => {
  const legs = seed.legs.map((leg) => {
    let quantity = 1;
    if (tier === 4) quantity = pick(rng, [2, 3]);
    if (tier === 5) quantity = pick(rng, [1, 2, 3]);
    return {
      kind: leg.kind,
      side: "long" as PayoffSide,
      quantity,
      strike: baseSpot + (leg.strikeOffset ?? 0),
      optionType: leg.optionType ?? "call",
      cashPayoff: leg.cashPayoff ?? 10,
      faceAmount: leg.faceAmount ?? 100,
      couponRate: leg.couponRate ?? 5,
      barrier: baseSpot + (leg.barrierOffset ?? -20),
      barrierType: leg.barrierType ?? "down-out",
      barrierTouched: leg.kind === "barrier" ? chance(rng, 0.3) : false,
      rebate: 0,
    };
  });
  if (tier === 5 && legs.length > 1) {
    for (const leg of legs) leg.side = chance(rng, 0.5) ? "long" : "short";
    const longs = legs.filter((leg) => leg.side === "long").length;
    const shorts = legs.length - longs;
    if (longs === 0) legs[0].side = "long";
    if (shorts === 0) legs[Math.floor(rng() * legs.length)].side = "short";
  }
  return legs;
};

const pickSpot = (rng: () => number, legs: PayoffLeg[]): number => {
  const strikes = legs.map((leg) => leg.strike).filter((value) => Number.isFinite(value) && value > 0);
  if (strikes.length) {
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    return integer(rng, Math.max(5, minStrike - 20), maxStrike + 20);
  }
  return integer(rng, 80, 120);
};

/* ------------------------------------------------------------------ */
/* Human-readable rendering                                            */
/* ------------------------------------------------------------------ */

export const legSideText = (leg: PayoffLeg): string => (leg.side === "long" ? "LONG" : "SHORT");

export const legDetailText = (leg: PayoffLeg): string => {
  switch (leg.kind) {
    case "equity": return `${leg.quantity} EQUITY`;
    case "forward": return `${leg.quantity} FORWARD ${leg.strike}`;
    case "call": return `${leg.quantity} CALL ${leg.strike}`;
    case "put": return `${leg.quantity} PUT ${leg.strike}`;
    case "digital": return `${leg.quantity} DIGITAL ${leg.optionType.toUpperCase()} ${leg.strike} · PAYS ${leg.cashPayoff}`;
    case "barrier": return `${leg.quantity} ${leg.optionType.toUpperCase()} ${leg.strike} · ${leg.barrierType.toUpperCase()} ${leg.barrier}${leg.barrierTouched ? " · HIT" : " · NOT HIT"}`;
    case "bond": return `${leg.quantity} ZERO BOND ${leg.faceAmount}`;
    case "coupon": return `${leg.quantity} COUPON BOND ${leg.couponRate}%`;
  }
};

const payoffFormula = (leg: PayoffLeg, spot: number): string => {
  const q = signedQuantity(leg);
  switch (leg.kind) {
    case "equity": return `${q} × ${spot}`;
    case "forward": return `${q} × (${spot} − ${leg.strike})`;
    case "call": return `${q} × max(${spot} − ${leg.strike}, 0)`;
    case "put": return `${q} × max(${leg.strike} − ${spot}, 0)`;
    case "digital": {
      const hit = leg.optionType === "call" ? spot > leg.strike : spot < leg.strike;
      return hit ? `${q} × ${leg.cashPayoff}` : `${q} × 0 (condition not met)`;
    }
    case "bond": return `${q} × ${leg.faceAmount}`;
    case "coupon": return `${q} × (${leg.faceAmount} + ${leg.faceAmount * leg.couponRate / 100})`;
    case "barrier": {
      const active = leg.barrierType.includes("out") ? !leg.barrierTouched : leg.barrierTouched;
      if (!active) return `${q} × ${leg.rebate} (barrier ${leg.barrierTouched ? "touched" : "not touched"})`;
      return leg.optionType === "call"
        ? `${q} × max(${spot} − ${leg.strike}, 0)`
        : `${q} × max(${leg.strike} − ${spot}, 0)`;
    }
  }
};

const explainPayoff = (legs: PayoffLeg[], spot: number, answer: number, valueForLeg: (leg: PayoffLeg) => number): string =>
  `${legs.map((leg) => {
    const value = valueForLeg(leg);
    return `${legSideText(leg)} ${legDetailText(leg)} → ${payoffFormula(leg, spot)} = ${value}`;
  }).join("   ·   ")}   TOTAL = ${answer}`;

const explainMaxProfit = (extremes: { max: number | "unbounded" }): string =>
  extremes.max === "unbounded"
    ? "The payoff keeps growing as S(T) rises, so the position has no cap on profit."
    : `The highest payoff the book can reach is ${extremes.max}; the position is capped once it is fully in the money.`;

const explainBreakeven = (legs: PayoffLeg[], root: number): string => {
  const above = bookPayoff(legs, root + 1);
  const below = bookPayoff(legs, root - 1);
  if (above > below) return `At S(T) = ${root} the book breaks even exactly. Profit increases as S(T) rises above ${root}.`;
  if (below > above) return `At S(T) = ${root} the book breaks even exactly. Profit increases as S(T) falls below ${root}.`;
  return `At S(T) = ${root} the book breaks even exactly.`;
};

/* ------------------------------------------------------------------ */
/* Choice (distractor) generation                                      */
/* ------------------------------------------------------------------ */

const distinctChoices = (choices: PayoffChoice[]): boolean =>
  new Set(choices.map((choice) => choice.label)).size === choices.length;

const payoffChoices = (rng: () => number, legs: PayoffLeg[], spot: number, answer: number, valueForLeg: (leg: PayoffLeg) => number, valueForBook: () => number): PayoffChoice[] => {
  const candidates = new Set<number>();
  const add = (value: number) => {
    const rounded = Math.round(value);
    if (Number.isFinite(rounded) && rounded !== answer) candidates.add(rounded);
  };
  add(0);
  add(spot);
  add(answer + 5); add(answer - 5);
  add(answer + 10); add(answer - 10);
  add(answer + 20); add(answer - 20);
  add(-answer);
  add(answer * 2);
  add(Math.round(answer / 2));
  add(spot - answer);
  add(answer - spot);
  for (const leg of legs) {
    add(valueForLeg(leg)); // single-leg payoff
    if (leg.kind === "call" || leg.kind === "put") add(Math.abs(spot - leg.strike)); // raw intrinsic
    if (leg.quantity > 1) add(Math.round(answer / leg.quantity)); // forgot quantity
    add(valueForBook() - valueForLeg(leg)); // forgot one leg
  }
  const distractors = shuffle(rng, [...candidates]).slice(0, 3);
  while (distractors.length < 3) {
    const filler = answer + (distractors.length + 1) * 7 * (chance(rng, 0.5) ? 1 : -1);
    if (filler !== answer && !distractors.includes(filler)) distractors.push(filler);
  }
  const answerIndex = Math.floor(rng() * 4);
  const options: (number | "unbounded")[] = [...distractors];
  options.splice(answerIndex, 0, answer);
  return options.map((value) => ({
    label: `${value}`,
    hint: value === "unbounded" ? "UNCAPPED" : value === 0 ? "ZERO PAYOFF" : value > 0 ? "POSITIVE" : "NEGATIVE",
    value,
  }));
};

const maxProfitChoices = (rng: () => number, legs: PayoffLeg[], extremes: { max: number | "unbounded"; min: number | "unbounded" }): PayoffChoice[] => {
  const answer = extremes.max;
  const candidates = new Set<number | "unbounded">();
  const add = (value: number | "unbounded") => {
    if (value === "unbounded") {
      if (answer !== "unbounded") candidates.add("unbounded");
      return;
    }
    const rounded = Math.round(value);
    if (Number.isFinite(rounded) && rounded !== answer) candidates.add(rounded);
  };
  add(0);
  if (extremes.min !== "unbounded") add(extremes.min);
  if (answer !== "unbounded") {
    add(answer + 10); add(answer - 10); add(answer + 20); add(answer * 2); add(Math.round(answer / 2));
  }
  const strikes = legs.filter((leg) => leg.kind === "call" || leg.kind === "put").map((leg) => leg.strike);
  if (strikes.length > 1) add(Math.abs(Math.max(...strikes) - Math.min(...strikes)));
  const distractors = shuffle(rng, [...candidates]).slice(0, 3);
  while (distractors.length < 3) {
    const filler = answer === "unbounded"
      ? (distractors.length + 1) * 25
      : answer + (distractors.length + 1) * 9 * (chance(rng, 0.5) ? 1 : -1);
    if (filler !== answer && !distractors.includes(filler)) distractors.push(filler);
  }
  const answerIndex = Math.floor(rng() * 4);
  const options: (number | "unbounded")[] = [...distractors];
  options.splice(answerIndex, 0, answer);
  return options.map((value) => ({
    label: value === "unbounded" ? "∞" : `${value}`,
    hint: value === "unbounded" ? "UNCAPPED" : "CAPPED",
    value,
  }));
};

const breakevenChoices = (rng: () => number, legs: PayoffLeg[], spot: number, root: number): PayoffChoice[] => {
  const candidates = new Set<number>();
  const add = (value: number) => {
    const rounded = Math.round(value);
    if (Number.isFinite(rounded) && rounded > 0 && rounded !== root) candidates.add(rounded);
  };
  for (const leg of legs) {
    if (leg.kind === "forward" || leg.kind === "call" || leg.kind === "put") add(leg.strike);
  }
  add(root + 5); add(root - 5); add(root + 10); add(root - 10); add(root + 20); add(root - 20);
  add(spot); add(spot + 10); add(spot - 10);
  const distractors = shuffle(rng, [...candidates]).slice(0, 3);
  while (distractors.length < 3) {
    const filler = root + (distractors.length + 1) * 15 * (chance(rng, 0.5) ? 1 : -1);
    if (filler > 0 && filler !== root && !distractors.includes(filler)) distractors.push(filler);
  }
  const answerIndex = Math.floor(rng() * 4);
  const options: number[] = [...distractors];
  options.splice(answerIndex, 0, root);
  return options.map((value) => ({ label: `${value}`, hint: "SPOT", value }));
};

/* ------------------------------------------------------------------ */
/* Question generation                                                 */
/* ------------------------------------------------------------------ */

const TYPE_META: Record<PayoffQuestionType, { label: string; text: string; scenario: string }> = {
  payoff: {
    label: "TERMINAL PAYOFF",
    text: "Terminal payoff of the book?",
    scenario: "The position settles at maturity. Compute the cash payoff of the whole book at the terminal spot.",
  },
  maxProfit: {
    label: "MAX PROFIT",
    text: "Maximum profit of the position?",
    scenario: "Look at every possible terminal spot. What is the best payoff the book can produce?",
  },
  breakeven: {
    label: "BREAKEVEN",
    text: "Breakeven spot S(T)?",
    scenario: "Find the terminal spot where the book's payoff is exactly zero.",
  },
};

const makeQuestion = (
  seed: PayoffSeed,
  tier: PayoffTier,
  type: PayoffQuestionType,
  legs: PayoffLeg[],
  spot: number,
  choices: PayoffChoice[],
  answerIndex: number,
  answerText: string,
  explanation: string,
): PayoffQuestion => {
  const longs = legs.filter((leg) => leg.side === "long").length;
  const meta = TYPE_META[type];
  return {
    seed,
    tier,
    type,
    legs,
    spot,
    levelLabel: levelLabel(tier),
    typeLabel: meta.label,
    questionText: type === "payoff" ? `Terminal payoff when S(T) = ${spot}?` : meta.text,
    scenarioText: meta.scenario,
    bookSummary: `${legs.length} LEG${legs.length > 1 ? "S" : ""} · ${longs} LONG · ${legs.length - longs} SHORT`,
    choices,
    answerIndex,
    answerText,
    explanation,
  };
};

const tryGenerate = (rng: () => number, seeds: PayoffSeed[], tier: PayoffTier, ql?: QuantLibRuntime): PayoffQuestion | undefined => {
  const pool = seeds.filter((seed) => {
    const count = seed.legs.length;
    if (tier === 1) return count === 1;
    if (tier === 2) return count === 2;
    if (tier === 3) return count === 3;
    if (tier === 4) return count >= 1 && count <= 3;
    return count >= 2 && count <= 3;
  });
  const seed = pick(rng, pool.length ? pool : seeds);
  const baseSpot = pick(rng, [90, 95, 100, 105, 110]);
  const legs = buildLegs(seed, rng, tier, baseSpot);
  const spot = pickSpot(rng, legs);
  const continuous = isContinuousBook(legs);

  let type = pickType(rng, tier);
  if (type === "breakeven") {
    if (continuous) {
      const roots = ql ? qlPayoffBreakevens(ql, legs) : breakevens(legs);
      if (roots.length === 1 && Number.isInteger(roots[0])) {
        const root = roots[0];
        const choices = breakevenChoices(rng, legs, spot, root);
        if (distinctChoices(choices)) {
          return makeQuestion(seed, tier, type, legs, spot, choices, choices.findIndex((c) => c.value === root), `${root}`, explainBreakeven(legs, root));
        }
      }
    }
    type = "payoff";
  } else if (type === "maxProfit") {
    if (continuous) {
      const extremes = ql ? qlPayoffExtremes(ql, legs) : payoffExtremes(legs);
      if (extremes) {
        const valid = extremes.max === "unbounded" || Number.isInteger(extremes.max);
        if (valid) {
          const choices = maxProfitChoices(rng, legs, extremes);
          if (distinctChoices(choices)) {
            return makeQuestion(seed, tier, type, legs, spot, choices, choices.findIndex((c) => c.value === extremes.max), extremes.max === "unbounded" ? "UNLIMITED" : `${extremes.max}`, explainMaxProfit(extremes));
          }
        }
      }
    }
    type = "payoff";
  }

  const valueForLeg = (leg: PayoffLeg) => ql
    ? ql.terminalPayoff(toTerminalLeg(leg), spot)
    : legPayoff(leg, spot);
  const valueForBook = () => legs.reduce((sum, leg) => sum + valueForLeg(leg), 0);
  const answer = valueForBook();
  const choices = payoffChoices(rng, legs, spot, answer, valueForLeg, valueForBook);
  if (!distinctChoices(choices)) return undefined;
  return makeQuestion(seed, tier, type, legs, spot, choices, choices.findIndex((c) => c.value === answer), `${answer}`, explainPayoff(legs, spot, answer, valueForLeg));
};

/** Fallback that can never fail: the classic long call example. */
const fallbackQuestion = (rng: () => number): PayoffQuestion => {
  const legs: PayoffLeg[] = [{ kind: "call", side: "long", quantity: 1, strike: 100, optionType: "call", cashPayoff: 10, faceAmount: 100, couponRate: 5, barrier: 80, barrierType: "down-out", barrierTouched: false, rebate: 0 }];
  const spot = 115;
  const answer = 15;
  const choices = shuffle(rng, [
    { label: "0", hint: "ZERO PAYOFF", value: 0 },
    { label: "10", hint: "POSITIVE", value: 10 },
    { label: "15", hint: "POSITIVE", value: 15 },
    { label: "115", hint: "POSITIVE", value: 115 },
  ]);
  return makeQuestion(
    { id: "LONG CALL", label: "Long call", legs: [{ kind: "call", strikeOffset: 0 }] },
    1,
    "payoff",
    legs,
    spot,
    choices,
    choices.findIndex((choice) => choice.value === answer),
    `${answer}`,
    explainPayoff(legs, spot, answer, (leg) => legPayoff(leg, spot)),
  );
};

export function generatePayoffQuestion(rng: () => number, seeds: PayoffSeed[], tier: PayoffTier, ql?: QuantLibRuntime): PayoffQuestion {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const question = tryGenerate(rng, seeds, tier, ql);
    if (question) return question;
  }
  return fallbackQuestion(rng);
}

/* ------------------------------------------------------------------ */
/* AI tutor prompt                                                     */
/* ------------------------------------------------------------------ */

export const buildPayoffPrompt = (question: PayoffQuestion, difficulty: string): string =>
  [
    "You are a derivatives tutor. Explain this missed payoff drill at the player's level. Teach the reflex, not just the number.",
    `PLAYER LEVEL: ${difficulty.toUpperCase()} (adapt the explanation and terminology to this level)`,
    `Drill level: ${question.levelLabel} · ${question.typeLabel}`,
    `Position: ${question.legs.map((leg) => `${legSideText(leg)} ${legDetailText(leg)}`).join(", ")}`,
    `Question: ${question.questionText}`,
    `Correct answer: ${question.answerText}`,
    `Working: ${question.explanation}`,
    "Give a short, level-appropriate rule for reading a position's terminal payoff, max profit, or breakeven instantly.",
  ].join("\n");

/* ------------------------------------------------------------------ */
/* Default question seeds (also the bank defaults)                     */
/* ------------------------------------------------------------------ */

export const payoffSeeds: PayoffSeed[] = [
  // Level 1 — one long leg
  { id: "LONG CALL", label: "Long call", legs: [{ kind: "call", strikeOffset: 0 }] },
  { id: "LONG PUT", label: "Long put", legs: [{ kind: "put", strikeOffset: 0 }] },
  { id: "LONG FORWARD", label: "Long forward", legs: [{ kind: "forward", strikeOffset: 0 }] },
  { id: "LONG EQUITY", label: "Long equity", legs: [{ kind: "equity" }] },
  { id: "LONG DIGITAL CALL", label: "Long digital call", legs: [{ kind: "digital", optionType: "call", strikeOffset: 0, cashPayoff: 10 }] },
  { id: "LONG DIGITAL PUT", label: "Long digital put", legs: [{ kind: "digital", optionType: "put", strikeOffset: 0, cashPayoff: 10 }] },
  { id: "LONG BOND", label: "Zero-coupon bond", legs: [{ kind: "bond", faceAmount: 100 }] },
  { id: "COUPON BOND", label: "Coupon bond", legs: [{ kind: "coupon", faceAmount: 100, couponRate: 5 }] },
  // Level 2 — two long legs
  { id: "STRADDLE", label: "Long straddle", legs: [{ kind: "call", strikeOffset: 0 }, { kind: "put", strikeOffset: 0 }] },
  { id: "STRANGLE", label: "Long strangle", legs: [{ kind: "put", strikeOffset: -5 }, { kind: "call", strikeOffset: 5 }] },
  { id: "CALL LADDER", label: "Call ladder", legs: [{ kind: "call", strikeOffset: 0 }, { kind: "call", strikeOffset: 15 }] },
  { id: "PUT LADDER", label: "Put ladder", legs: [{ kind: "put", strikeOffset: -15 }, { kind: "put", strikeOffset: 0 }] },
  { id: "FORWARD + CALL", label: "Forward plus call", legs: [{ kind: "forward", strikeOffset: 0 }, { kind: "call", strikeOffset: 0 }] },
  { id: "PROTECTIVE PUT", label: "Protective put", legs: [{ kind: "equity" }, { kind: "put", strikeOffset: -10 }] },
  { id: "DIGITAL + CALL", label: "Digital plus call", legs: [{ kind: "digital", optionType: "call", strikeOffset: 0, cashPayoff: 10 }, { kind: "call", strikeOffset: 10 }] },
  { id: "BARRIER CALL", label: "Barrier call", legs: [{ kind: "barrier", optionType: "call", strikeOffset: 0, barrierOffset: -20 }] },
  // Level 3 — three long legs
  { id: "LADDER 3", label: "Call ladder", legs: [{ kind: "call", strikeOffset: 0 }, { kind: "call", strikeOffset: 10 }, { kind: "call", strikeOffset: 20 }] },
  { id: "STRADDLE + FORWARD", label: "Straddle plus forward", legs: [{ kind: "call", strikeOffset: 0 }, { kind: "put", strikeOffset: 0 }, { kind: "forward", strikeOffset: 0 }] },
  { id: "2 CALLS + PUT", label: "Two calls plus a put", legs: [{ kind: "call", strikeOffset: 0 }, { kind: "call", strikeOffset: 15 }, { kind: "put", strikeOffset: -5 }] },
  { id: "PUTS + CALL", label: "Two puts plus a call", legs: [{ kind: "put", strikeOffset: -15 }, { kind: "put", strikeOffset: 0 }, { kind: "call", strikeOffset: 10 }] },
  { id: "EQUITY + PUT + CALL", label: "Equity plus put plus call", legs: [{ kind: "equity" }, { kind: "put", strikeOffset: -10 }, { kind: "call", strikeOffset: 10 }] },
  { id: "BARRIER MIX", label: "Barrier, call and put", legs: [{ kind: "barrier", optionType: "call", strikeOffset: 0, barrierOffset: -20 }, { kind: "call", strikeOffset: 15 }, { kind: "put", strikeOffset: -15 }] },
];
