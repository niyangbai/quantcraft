// orderbookGame.ts — business logic for the Order Book drill.
// The deterministic matching math lives in @quantcraft/finmath (orderbook);
// this module owns the book templates, event generation, question building,
// distractor selection, and the AI tutor prompt. No React, no storage.

import { depthAt, matchMarketOrder } from "@quantcraft/finmath";
import type { BookSide, MatchResult, OrderBook, OrderSide } from "@quantcraft/finmath";

export type OrderBookSeed = {
  id: string;
  label: string;
  /** Tick distance between the best bid and the best ask. */
  spreadTicks: number;
  /** Sizes at the best bid, best bid − 1 tick, ... */
  bids: number[];
  /** Sizes at the best ask, best ask + 1 tick, ... */
  asks: number[];
};

export type OrderbookEvent = { side: OrderSide; size: number };

export type OrderbookQuestionType = "bestAsk" | "bestBid" | "spread" | "vwap" | "depth";

export type OrderbookChoice = { label: string; value: number };

export type OrderbookQuestion = {
  seed: OrderBookSeed;
  /** The book before the event, prices in integer ticks (1 tick = 0.01). */
  book: OrderBook;
  event: OrderbookEvent;
  result: MatchResult;
  type: OrderbookQuestionType;
  questionText: string;
  /** Ticks; only set for depth questions (the level being checked). */
  targetPrice?: number;
  choices: OrderbookChoice[];
  answerIndex: number;
  answerText: string;
  explanation: string;
};

export const TICK = 0.01;
export const priceToTicks = (price: number): number => Math.round(price / TICK);
export const formatPrice = (ticks: number): string => (ticks / 100).toFixed(2);

/* ------------------------------------------------------------------ */
/* Random helpers (stateless; the caller passes a seeded rng)          */
/* ------------------------------------------------------------------ */

const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
const integer = (rng: () => number, min: number, max: number): number => Math.round(min + rng() * (max - min));

const shuffle = <T,>(rng: () => number, items: readonly T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

/* ------------------------------------------------------------------ */
/* Book lifecycle                                                      */
/* ------------------------------------------------------------------ */

/** Build a fresh book from a seed around a random base price (in ticks). */
export function buildInitialBook(rng: () => number, seed: OrderBookSeed): OrderBook {
  const bestBid = integer(rng, 8500, 11500); // 85.00–115.00
  const bestAsk = bestBid + seed.spreadTicks;
  return {
    bids: seed.bids.map((size, index) => ({ price: bestBid - index, size })),
    asks: seed.asks.map((size, index) => ({ price: bestAsk + index, size })),
  };
}

/** Pick a seed and build the opening book for a run. */
export function generateInitialBook(rng: () => number, seeds: OrderBookSeed[]): { book: OrderBook; seed: OrderBookSeed } {
  const seed = pick(rng, seeds.length ? seeds : orderBookSeedDefaults);
  return { book: buildInitialBook(rng, seed), seed };
}

/** A book is playable while both sides have meaningful depth. */
export function isBookHealthy(book: OrderBook): boolean {
  const depth = (levels: { size: number }[]) => levels.reduce((sum, level) => sum + level.size, 0);
  return book.asks.length > 0 && book.bids.length > 0 && depth(book.asks) >= 100 && depth(book.bids) >= 100;
}

/** Execute the event on the book and return the updated book. */
export function applyEvent(book: OrderBook, event: OrderbookEvent): OrderBook {
  return matchMarketOrder(book, event.side, event.size).book;
}

const SIZES = [100, 150, 200, 250, 300];

const sideDepth = (book: OrderBook, side: OrderSide): number => {
  const levels = side === "buy" ? book.asks : book.bids;
  return levels.reduce((sum, level) => sum + level.size, 0);
};

/** Pick a market order that never fully clears the side it hits, so best quotes stay defined. */
function generateEvent(rng: () => number, book: OrderBook): OrderbookEvent {
  const side: OrderSide = rng() < 0.5 ? "buy" : "sell";
  const size = Math.min(pick(rng, SIZES), Math.max(1, sideDepth(book, side) - 1));
  return { side, size };
}

/* ------------------------------------------------------------------ */
/* Question generation                                                 */
/* ------------------------------------------------------------------ */

const BUY_WEIGHTS: [OrderbookQuestionType, number][] = [["bestAsk", 35], ["spread", 20], ["vwap", 25], ["depth", 20]];
const SELL_WEIGHTS: [OrderbookQuestionType, number][] = [["bestBid", 35], ["spread", 20], ["vwap", 25], ["depth", 20]];

const pickType = (rng: () => number, side: OrderSide): OrderbookQuestionType => {
  const weights = side === "buy" ? BUY_WEIGHTS : SELL_WEIGHTS;
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [type, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return side === "buy" ? "bestAsk" : "bestBid";
};

const QUESTION_TEXT: Record<OrderbookQuestionType, string> = {
  bestAsk: "New best ask?",
  bestBid: "New best bid?",
  spread: "New spread?",
  vwap: "Fill VWAP?",
  depth: "Remaining depth?",
};

const hitSide = (event: OrderbookEvent): BookSide => (event.side === "buy" ? "ask" : "bid");

const bookLevels = (book: OrderBook, side: BookSide) => (side === "bid" ? book.bids : book.asks);

const questionAnswer = (
  base: Omit<OrderbookQuestion, "choices" | "answerIndex" | "answerText" | "explanation">,
): { value: number; targetPrice?: number } => {
  const { book, event, result, type } = base;
  const side = hitSide(event);
  if (type === "bestAsk") return { value: result.book.asks[0]?.price ?? 0 };
  if (type === "bestBid") return { value: result.book.bids[0]?.price ?? 0 };
  if (type === "spread") return { value: (result.book.asks[0]?.price ?? 0) - (result.book.bids[0]?.price ?? 0) };
  if (type === "vwap") return { value: Math.round(result.averagePrice) };
  const targetPrice = bookLevels(book, side)[0]?.price ?? 0;
  return { value: depthAt(result.book, side, targetPrice), targetPrice };
};

const candidatePrices = (answer: number, book: OrderBook, event: OrderbookEvent): number[] => {
  const oldBest = bookLevels(book, hitSide(event))[0]?.price ?? 0;
  return [oldBest, answer + 1, answer + 2, answer - 1, answer - 2, answer + 3, book.bids[0]?.price ?? 0, book.asks[0]?.price ?? 0];
};

const candidateSizes = (answer: number): number[] => [0, answer + 50, answer - 50, answer + 100, answer - 100, 150, 250, 400];

function buildChoices(
  rng: () => number,
  base: Omit<OrderbookQuestion, "choices" | "answerIndex" | "answerText" | "explanation">,
  answer: number,
): { choices: OrderbookChoice[]; answerIndex: number; answerText: string } {
  const pool = base.type === "depth" ? candidateSizes(answer) : candidatePrices(answer, base.book, base.event);
  const distractors = shuffle(rng, [...new Set(pool.filter((value) => Number.isFinite(value) && value > 0 && value !== answer))]).slice(0, 3);
  const step = base.type === "depth" ? 75 : 1;
  let attempts = 0;
  while (distractors.length < 3 && attempts < 60) {
    attempts += 1;
    const filler = answer + (distractors.length + 1) * step * (rng() < 0.5 ? 1 : -1);
    if (filler > 0 && filler !== answer && !distractors.includes(filler)) distractors.push(filler);
  }
  // Deterministic fallback: answers are never negative, so walking upward always succeeds.
  for (let offset = 1; distractors.length < 3; offset += 1) {
    const filler = answer + offset * step;
    if (filler > 0 && filler !== answer && !distractors.includes(filler)) distractors.push(filler);
  }
  const answerIndex = Math.floor(rng() * 4);
  const options: number[] = [...distractors];
  options.splice(answerIndex, 0, answer);
  const format = base.type === "depth" ? (value: number) => `${value}` : formatPrice;
  return { choices: options.map((value) => ({ label: format(value), value })), answerIndex, answerText: format(answer) };
}

const explain = (
  base: Omit<OrderbookQuestion, "choices" | "answerIndex" | "answerText" | "explanation">,
  answerText: string,
  targetPrice?: number,
): string => {
  const { book, event, result, type } = base;
  const side = hitSide(event);
  const fills = result.fills.map((fill) => `${fill.size} @ ${formatPrice(fill.price)}`).join(", ");
  const oldBest = bookLevels(book, side)[0]?.price ?? 0;
  switch (type) {
    case "bestAsk":
    case "bestBid":
      return `MARKET ${event.side.toUpperCase()} ${event.size} consumes ${fills}. The old best ${side} ${formatPrice(oldBest)} is ${result.fills[0]?.size >= (bookLevels(book, side)[0]?.size ?? 0) ? "cleared" : "partially filled"} → new best ${side} = ${answerText}.`;
    case "spread":
      return `Best ask ${formatPrice(result.book.asks[0]?.price ?? 0)} − best bid ${formatPrice(result.book.bids[0]?.price ?? 0)} = ${answerText}.`;
    case "vwap":
      return `Fill = ${fills} → VWAP = (${result.fills.map((fill) => `${fill.size}·${formatPrice(fill.price)}`).join(" + ")})/${result.filledSize} ≈ ${answerText}.`;
    case "depth":
      return `MARKET ${event.side.toUpperCase()} ${event.size} hit ${formatPrice(targetPrice ?? 0)}; it keeps ${depthAt(result.book, side, targetPrice ?? 0)} of its original ${bookLevels(book, side).find((level) => level.price === targetPrice)?.size ?? 0} → remaining ${answerText}.`;
  }
};

export function generateQuestion(rng: () => number, book: OrderBook, seed: OrderBookSeed): OrderbookQuestion {
  const event = generateEvent(rng, book);
  const result = matchMarketOrder(book, event.side, event.size);
  const type = pickType(rng, event.side);
  const base = { seed, book, event, result, type, questionText: QUESTION_TEXT[type] };
  const { value, targetPrice } = questionAnswer(base);
  const { choices, answerIndex, answerText } = buildChoices(rng, base, value);
  return {
    ...base,
    targetPrice,
    choices,
    answerIndex,
    answerText,
    explanation: explain(base, answerText, targetPrice),
  };
}

/* ------------------------------------------------------------------ */
/* Default book templates (also the fallback when a bank omits them)   */
/* ------------------------------------------------------------------ */

export const orderBookSeedDefaults: OrderBookSeed[] = [
  { id: "CLASSIC", label: "Classic ladder", spreadTicks: 2, bids: [250, 400, 300, 200], asks: [150, 200, 350, 250] },
  { id: "THIN TOP", label: "Thin at the top", spreadTicks: 2, bids: [100, 450, 300, 250], asks: [120, 280, 400, 300] },
  { id: "DEEP", label: "Deep book", spreadTicks: 2, bids: [300, 500, 450, 400], asks: [300, 450, 500, 400] },
  { id: "WIDE", label: "Wide spread", spreadTicks: 5, bids: [200, 350, 400, 300], asks: [180, 320, 380, 280] },
];

/* ------------------------------------------------------------------ */
/* AI tutor prompt                                                     */
/* ------------------------------------------------------------------ */

export const buildOrderbookPrompt = (question: OrderbookQuestion, difficulty: string): string =>
  [
    "You are a market-microstructure tutor. Explain this missed order-book drill at the player's level.",
    `PLAYER LEVEL: ${difficulty.toUpperCase()}`,
    `Book before the order: ${JSON.stringify(question.book)}`,
    `Event: MARKET ${question.event.side.toUpperCase()} ${question.event.size}`,
    `Question: ${question.questionText}`,
    `Correct answer: ${question.answerText}`,
    `Working: ${question.explanation}`,
    "Give a short rule for reading how a market order moves the best quote, spread, fill VWAP, or remaining depth.",
  ].join("\n");

