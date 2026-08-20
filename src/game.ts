import type { QuantLibRuntime } from "@quantcraft/market-kernel";

export type Mode = "landing" | "craft" | "greekthon" | "hedge" | "collection";
export type IngredientId = "equity" | "bond" | "call" | "put" | "digital" | "barrier" | "coupon";
export type RuntimeState = {
  status: "loading" | "ready" | "error";
  ql?: QuantLibRuntime;
  error?: string;
};
export type Side = "long" | "short";
export type CraftLeg = {
  uid: number;
  kind: IngredientId;
  side: Side;
  quantity: number;
  strike: number;
  faceAmount: number;
  couponRate: number;
  maturityDate: string;
  cashPayoff: number;
  barrier: number;
  barrierType: "down-in" | "up-in" | "down-out" | "up-out";
  optionType: "call" | "put";
};
export const ingredients: {
  id: IngredientId;
  label: string;
  detail: string;
  color: string;
  symbol: string;
}[] = [
  {
    id: "equity",
    label: "SX5E Equity",
    detail: "Spot position",
    color: "mint",
    symbol: "EQ",
  },
  {
    id: "bond",
    label: "Zero Bond",
    detail: "Principal protection",
    color: "sand",
    symbol: "B",
  },
  {
    id: "call",
    label: "Call",
    detail: "Analytic European",
    color: "coral",
    symbol: "↗",
  },
  {
    id: "put",
    label: "Put",
    detail: "Analytic European",
    color: "mint",
    symbol: "↘",
  },
  {
    id: "digital",
    label: "Digital",
    detail: "Cash-or-nothing",
    color: "blue",
    symbol: "01",
  },
  {
    id: "barrier",
    label: "Barrier",
    detail: "Knock-in / knock-out",
    color: "coral",
    symbol: "│",
  },
  {
    id: "coupon",
    label: "Coupon Bond",
    detail: "FixedRateBond cash flows",
    color: "blue",
    symbol: "%",
  },
];

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
export const money = (n: number) => n.toFixed(2);
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

export type CraftMission = {
  id: string; title: string; client: string; market: typeof market;
  budget: number; protection: number; minDelta: number;
  requiredKind: IngredientId; requiredLabel: string;
};
export type GreekScenario = { label: string; detail: string; spot: number; vol: number; rate: number; date: string };
export type GreekBook = { name: string; legs: { type: "call" | "put"; strike: number; qty: number }[] };
export type GreekMetric = "value" | "delta" | "gamma" | "vega" | "theta" | "rho";
export type HedgeLeg = { type: "call" | "put"; strike: number; qty: number };
export type HedgeProduct = { name: string; description: string; extra: string; legs: HedgeLeg[] };
export type QuestionBank = {
  version: 1;
  craft: CraftMission[];
  greekthon: { scenarios: GreekScenario[]; books: GreekBook[]; metrics: GreekMetric[] };
  hedge: { products: HedgeProduct[] };
};
export type Settlement = { game: "Craft" | "Greekthon" | "Hedge"; label: string; score: number; at: string };
export type PlayerProfile = { name: string; storage: boolean };
export type Difficulty = "intern" | "analyst" | "associate" | "vp" | "director" | "md";
export const difficultyLives: Record<Difficulty, number | null> = { intern: null, analyst: 5, associate: 4, vp: 3, director: 2, md: 1 };
export type Scoreboard = {
  difficulty: Difficulty;
  maxLives: number;
  lives: number;
  gameOver: boolean;
  craft: { score: number; rounds: number; wins: number; best: number };
  greekthon: { score: number; answers: number; correct: number; bestStreak: number };
  hedge: { score: number; rounds: number; passed: number; best: number };
  recent: Settlement[];
};
export const emptyScoreboard: Scoreboard = {
  difficulty: "vp",
  maxLives: 3,
  lives: 3,
  gameOver: false,
  craft: { score: 0, rounds: 0, wins: 0, best: 0 },
  greekthon: { score: 0, answers: 0, correct: 0, bestStreak: 0 },
  hedge: { score: 0, rounds: 0, passed: 0, best: 0 },
  recent: [],
};
export const craftMissions: CraftMission[] = [
  { id: "NERVOUS BULL", title: "The Nervous Bull", client: "Protect the capital while keeping meaningful SX5E upside.", market, budget: 100.5, protection: 100, minDelta: 0.05, requiredKind: "call", requiredLabel: "Include a long call" },
  { id: "CAUTIOUS CLIMBER", title: "The Cautious Climber", client: "Rates are higher. Lock in redemption and retain some equity participation.", market: { ...market, evaluationDate: "2026-03-16", maturityDate: "2030-03-18", spot: 112, strike: 112, rate: 0.04, expectedReturn: 0.065, dividend: 0.018, volatility: 0.24 }, budget: 100, protection: 100, minDelta: 0.08, requiredKind: "bond", requiredLabel: "Include a zero bond" },
  { id: "INCOME ARCHITECT", title: "The Income Architect", client: "Build a protected investment with contractual fixed coupons and positive equity delta.", market: { ...market, evaluationDate: "2027-09-01", maturityDate: "2032-09-01", spot: 94, strike: 94, rate: 0.032, expectedReturn: 0.085, dividend: 0.012, volatility: 0.28 }, budget: 106, protection: 100, minDelta: 0.03, requiredKind: "coupon", requiredLabel: "Include a coupon bond" },
];
export const exampleQuestionBank: QuestionBank = {
  version: 1,
  craft: craftMissions,
  greekthon: {
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
  const bank = input as Partial<QuestionBank>;
  if (bank.version !== 1) throw new Error("version must be 1");
  if (!Array.isArray(bank.craft) || bank.craft.length === 0) throw new Error("craft must contain at least one question");
  if (!bank.greekthon || !Array.isArray(bank.greekthon.scenarios) || !bank.greekthon.scenarios.length || !Array.isArray(bank.greekthon.books) || !bank.greekthon.books.length || !Array.isArray(bank.greekthon.metrics) || !bank.greekthon.metrics.length) throw new Error("greekthon requires scenarios, books, and metrics");
  if (!bank.hedge || !Array.isArray(bank.hedge.products) || !bank.hedge.products.length) throw new Error("hedge.products must contain at least one product");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  bank.craft.forEach((q, i) => {
    if (!q.id || !q.title || !q.client || !q.requiredLabel || !q.market || !iso.test(q.market.evaluationDate) || !iso.test(q.market.maturityDate) || q.market.maturityDate <= q.market.evaluationDate) throw new Error(`craft[${i}] has invalid text, market, or dates`);
    if (![q.budget, q.protection, q.minDelta, q.market.spot, q.market.rate, q.market.expectedReturn, q.market.dividend, q.market.volatility].every(Number.isFinite)) throw new Error(`craft[${i}] has invalid numbers`);
    if (q.budget <= 0 || q.protection < 0 || q.market.spot <= 0 || q.market.volatility <= 0) throw new Error(`craft[${i}] has values outside the pricing domain`);
    if (!ingredients.some((x) => x.id === q.requiredKind)) throw new Error(`craft[${i}].requiredKind is unsupported`);
  });
  if (new Set(bank.craft.map((x) => x.id)).size !== bank.craft.length) throw new Error("craft question ids must be unique");
  bank.greekthon.scenarios.forEach((q, i) => {
    if (!q.label || !q.detail || !iso.test(q.date) || q.date >= market.maturityDate || ![q.spot, q.vol, q.rate].every(Number.isFinite) || q.spot <= 0 || q.vol <= 0) throw new Error(`greekthon.scenarios[${i}] is invalid`);
  });
  bank.greekthon.books.forEach((q, i) => {
    if (!q.name || !Array.isArray(q.legs) || !q.legs.length || q.legs.some((leg) => !["call", "put"].includes(leg.type) || !Number.isFinite(leg.strike) || leg.strike <= 0 || !Number.isFinite(leg.qty) || leg.qty === 0)) throw new Error(`greekthon.books[${i}] is invalid`);
  });
  if (bank.greekthon.metrics.some((x) => !["value", "delta", "gamma", "vega", "theta", "rho"].includes(x))) throw new Error("greekthon.metrics contains an unsupported KPI");
  bank.hedge.products.forEach((product, i) => {
    if (!product.name || !product.description || !product.extra || !Array.isArray(product.legs) || !product.legs.length) throw new Error(`hedge.products[${i}] requires text and at least one option leg`);
    if (product.legs.some((leg) => !["call", "put"].includes(leg.type) || !Number.isFinite(leg.strike) || leg.strike <= 0 || !Number.isFinite(leg.qty) || leg.qty === 0)) throw new Error(`hedge.products[${i}].legs is invalid`);
  });
  return bank as QuestionBank;
};
export const randomizeMission = (template: CraftMission) => {
  const rng = seededRandom(secureSeed());
  const evaluation = new Date(Date.UTC(2025 + Math.floor(rng() * 5), Math.floor(rng() * 12), 2 + Math.floor(rng() * 18)));
  const maturity = new Date(evaluation);
  maturity.setUTCFullYear(maturity.getUTCFullYear() + 2 + Math.floor(rng() * 5));
  const spot = Math.round(between(rng, 75, 135));
  return {
    ...template,
    market: {
      ...template.market,
      evaluationDate: isoDate(evaluation),
      maturityDate: isoDate(maturity),
      spot,
      strike: spot,
      rate: Number(between(rng, .005, .06).toFixed(4)),
      expectedReturn: Number(between(rng, .035, .12).toFixed(4)),
      dividend: Number(between(rng, 0, .035).toFixed(4)),
      volatility: Number(between(rng, .12, .42).toFixed(4)),
    },
    budget: Math.round((template.budget + between(rng, 0, 3)) * 2) / 2,
    minDelta: Number(between(rng, .03, .15).toFixed(2)),
  };
};
export const randomMission = (missions: CraftMission[], previous?: string) => {
  const choices = missions.filter((x) => x.id !== previous);
  const template = choices[Math.floor((secureSeed() / 4294967296) * choices.length)] ?? missions[0];
  return randomizeMission(template);
};
