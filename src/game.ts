import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import type { PayoffSeed } from "./payoffGame";
import { orderBookSeedDefaults } from "./orderbookGame";
import type { OrderBookSeed } from "./orderbookGame";

export type Mode = "landing" | "payoff" | "greek" | "orderbook" | "hedge" | "collection";
export type RuntimeState = {
  status: "loading" | "ready" | "error";
  ql?: QuantLibRuntime;
  error?: string;
};
export type GreekScenario = { label: string; detail: string; spot: number; vol: number; rate: number; date: string };
export type GreekBook = { name: string; legs: { type: "call" | "put"; strike: number; qty: number }[] };
export type GreekMetric = "value" | "delta" | "gamma" | "vega" | "theta" | "rho";
export type HedgeLeg = { type: "call" | "put"; strike: number; qty: number };
export type HedgeProduct = { name: string; description: string; extra: string; legs: HedgeLeg[] };
export type QuestionBank = {
  version: 1;
  payoff: PayoffSeed[];
  greek: { scenarios: GreekScenario[]; books: GreekBook[]; metrics: GreekMetric[] };
  orderbook: OrderBookSeed[];
  hedge: { products: HedgeProduct[] };
};
export type Settlement = { game: "Payoff" | "Greek" | "Order Book" | "Hedge"; label: string; score: number; at: string };
export type PlayerProfile = { name: string; storage: boolean };
export type Difficulty = "intern" | "analyst" | "associate" | "vp" | "director" | "md";
export const difficultyLives: Record<Difficulty, number | null> = { intern: null, analyst: 5, associate: 4, vp: 3, director: 2, md: 1 };
export type Scoreboard = {
  difficulty: Difficulty;
  maxLives: number;
  lives: number;
  streak: number;
  gameOver: boolean;
  payoff: { score: number; answers: number; correct: number; bestStreak: number };
  greek: { score: number; answers: number; correct: number; bestStreak: number };
  orderbook: { score: number; answers: number; correct: number; bestStreak: number };
  hedge: { score: number; rounds: number; passed: number; best: number };
  recent: Settlement[];
};
export const emptyScoreboard: Scoreboard = {
  difficulty: "intern",
  maxLives: 0,
  lives: 0,
  streak: 0,
  gameOver: false,
  payoff: { score: 0, answers: 0, correct: 0, bestStreak: 0 },
  greek: { score: 0, answers: 0, correct: 0, bestStreak: 0 },
  orderbook: { score: 0, answers: 0, correct: 0, bestStreak: 0 },
  hedge: { score: 0, rounds: 0, passed: 0, best: 0 },
  recent: [],
};

export const market = {
  evaluationDate: "2025-01-02",
  maturityDate: "2028-01-03",
  spot: 100,
  strike: 100,
  rate: 0.025,
  expectedReturn: 0.07,
  dividend: 0.015,
  volatility: 0.2,
};
export const secureSeed = () => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
};
export const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};
export const between = (rng: () => number, min: number, max: number) => min + rng() * (max - min);
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

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

export const exampleQuestionBank: QuestionBank = {
  version: 1,
  payoff: payoffSeeds,
  greek: {
    scenarios: [
      { label: "Spot rallies", detail: "SX5E 100 → 118", spot: 118, vol: .2, rate: .025, date: "2025-01-02" },
      { label: "Spot crashes", detail: "SX5E 100 → 76", spot: 76, vol: .2, rate: .025, date: "2025-01-02" },
      { label: "Volatility jumps", detail: "Vol 20% → 38%", spot: 100, vol: .38, rate: .025, date: "2025-01-02" },
      { label: "Rates rise", detail: "EUR rate 2.5% → 4.0%", spot: 100, vol: .2, rate: .04, date: "2025-01-02" },
      { label: "Three months pass", detail: "02 Jan → 02 Apr 2025", spot: 100, vol: .2, rate: .025, date: "2025-04-02" },
      { label: "Crash + vol storm", detail: "Spot 78 · Vol 42%", spot: 78, vol: .42, rate: .025, date: "2025-01-02" },
    ],
    books: [
      { name: "Long ATM Call", legs: [{ type: "call", strike: 100, qty: 1 }] },
      { name: "Short ATM Put", legs: [{ type: "put", strike: 100, qty: -1 }] },
      { name: "Long Straddle", legs: [{ type: "call", strike: 100, qty: 1 }, { type: "put", strike: 100, qty: 1 }] },
      { name: "Call Spread", legs: [{ type: "call", strike: 95, qty: 1 }, { type: "call", strike: 115, qty: -1 }] },
      { name: "Put Spread", legs: [{ type: "put", strike: 105, qty: 1 }, { type: "put", strike: 80, qty: -1 }] },
      { name: "Short Strangle", legs: [{ type: "put", strike: 90, qty: -1 }, { type: "call", strike: 110, qty: -1 }] },
    ],
    metrics: ["value", "delta", "gamma", "vega", "theta", "rho"],
  },
  orderbook: orderBookSeedDefaults,
  hedge: {
    products: [
      { name: "Capital Protected Note", description: "Zero bond + long participation call", extra: "100 face zero bond", legs: [{ type: "call", strike: 100, qty: 1 }] },
      { name: "Reverse Convertible", description: "Coupon bond + short downside put", extra: "100 face coupon bond", legs: [{ type: "put", strike: 90, qty: -1 }] },
      { name: "Capped Participation Note", description: "Bond + financed call spread", extra: "100 face zero bond", legs: [{ type: "call", strike: 100, qty: 1 }, { type: "call", strike: 120, qty: -1 }] },
      { name: "Volatility Note", description: "Bond + long straddle exposure", extra: "100 face zero bond", legs: [{ type: "call", strike: 100, qty: 1 }, { type: "put", strike: 100, qty: 1 }] },
    ],
  },
};

export const parseQuestionBank = (input: unknown): QuestionBank => {
  if (!input || typeof input !== "object") throw new Error("Root must be a JSON object");
  const bank = input as Partial<QuestionBank> & { greekthon?: QuestionBank["greek"] };
  if (bank.greekthon && !bank.greek) bank.greek = bank.greekthon; // legacy banks used the "greekthon" key
  if (bank.version !== 1) throw new Error("version must be 1");
  if (!Array.isArray(bank.payoff) || bank.payoff.length === 0) throw new Error("payoff must contain at least one position seed");
  if (!bank.greek || !Array.isArray(bank.greek.scenarios) || !bank.greek.scenarios.length || !Array.isArray(bank.greek.books) || !bank.greek.books.length || !Array.isArray(bank.greek.metrics) || !bank.greek.metrics.length) throw new Error("greek requires scenarios, books, and metrics");
  if (!Array.isArray(bank.orderbook) || !bank.orderbook.length) bank.orderbook = orderBookSeedDefaults; // legacy banks predate orderbook templates
  if (!bank.hedge || !Array.isArray(bank.hedge.products) || !bank.hedge.products.length) throw new Error("hedge.products must contain at least one product");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const payoffKinds = ["equity", "forward", "call", "put", "digital", "barrier", "bond", "coupon"];
  bank.payoff.forEach((seed, i) => {
    if (!seed.id || !seed.label || !Array.isArray(seed.legs) || !seed.legs.length) throw new Error(`payoff[${i}] requires id, label, and at least one leg`);
    seed.legs.forEach((leg, j) => {
      if (!payoffKinds.includes(leg.kind)) throw new Error(`payoff[${i}].legs[${j}].kind is unsupported`);
      if (leg.strikeOffset !== undefined && !Number.isInteger(leg.strikeOffset)) throw new Error(`payoff[${i}].legs[${j}].strikeOffset must be an integer`);
      if (leg.kind === "digital" && !Number.isFinite(leg.cashPayoff)) throw new Error(`payoff[${i}].legs[${j}] digital legs need a numeric cashPayoff`);
      if (leg.kind === "barrier" && !Number.isFinite(leg.barrierOffset)) throw new Error(`payoff[${i}].legs[${j}] barrier legs need a numeric barrierOffset`);
    });
  });
  if (new Set(bank.payoff.map((x) => x.id)).size !== bank.payoff.length) throw new Error("payoff question ids must be unique");
  bank.greek.scenarios.forEach((q, i) => {
    if (!q.label || !q.detail || !iso.test(q.date) || q.date >= market.maturityDate || ![q.spot, q.vol, q.rate].every(Number.isFinite) || q.spot <= 0 || q.vol <= 0) throw new Error(`greek.scenarios[${i}] is invalid`);
  });
  bank.greek.books.forEach((q, i) => {
    if (!q.name || !Array.isArray(q.legs) || !q.legs.length || q.legs.some((leg) => !["call", "put"].includes(leg.type) || !Number.isFinite(leg.strike) || leg.strike <= 0 || !Number.isFinite(leg.qty) || leg.qty === 0)) throw new Error(`greek.books[${i}] is invalid`);
  });
  if (bank.greek.metrics.some((x) => !["value", "delta", "gamma", "vega", "theta", "rho"].includes(x))) throw new Error("greek.metrics contains an unsupported KPI");
  bank.orderbook.forEach((seed, i) => {
    if (!seed.id || !seed.label || !Number.isInteger(seed.spreadTicks) || seed.spreadTicks <= 0) throw new Error(`orderbook[${i}] requires id, label, and a positive integer spreadTicks`);
    if (!Array.isArray(seed.bids) || !seed.bids.length || !Array.isArray(seed.asks) || !seed.asks.length || seed.bids.some((size) => !Number.isFinite(size) || size <= 0) || seed.asks.some((size) => !Number.isFinite(size) || size <= 0)) throw new Error(`orderbook[${i}] requires positive sizes for bids and asks`);
  });
  if (new Set(bank.orderbook.map((x) => x.id)).size !== bank.orderbook.length) throw new Error("orderbook question ids must be unique");
  bank.hedge.products.forEach((product, i) => {
    if (!product.name || !product.description || !product.extra || !Array.isArray(product.legs) || !product.legs.length) throw new Error(`hedge.products[${i}] requires text and at least one option leg`);
    if (product.legs.some((leg) => !["call", "put"].includes(leg.type) || !Number.isFinite(leg.strike) || leg.strike <= 0 || !Number.isFinite(leg.qty) || leg.qty === 0)) throw new Error(`hedge.products[${i}].legs is invalid`);
  });
  return bank as QuestionBank;
};

