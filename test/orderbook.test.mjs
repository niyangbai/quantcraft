import test from "node:test";
import assert from "node:assert/strict";
import { bestAsk, bestBid, spread, depthAt, matchMarketOrder } from "@quantcraft/finmath";
import {
  applyEvent,
  buildInitialBook,
  formatPrice,
  generateInitialBook,
  generateQuestion,
  isBookHealthy,
  orderBookSeedDefaults,
} from "./dist/orderbookGame.js";

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

const SEEDS = orderBookSeedDefaults;
const pickSeed = (n) => SEEDS[n % SEEDS.length];

test("buildInitialBook lays a clean, sorted ladder", () => {
  const book = buildInitialBook(rng(1), SEEDS[0]);
  assert.equal(book.bids.length, SEEDS[0].bids.length);
  assert.equal(book.asks.length, SEEDS[0].asks.length);
  assert.equal(spread(book), SEEDS[0].spreadTicks);
  for (let i = 1; i < book.asks.length; i += 1) assert.ok(book.asks[i].price > book.asks[i - 1].price);
  for (let i = 1; i < book.bids.length; i += 1) assert.ok(book.bids[i].price < book.bids[i - 1].price);
  assert.ok(isBookHealthy(book));
});

test("generateInitialBook picks a template and builds around a price", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const { book, seed: picked } = generateInitialBook(rng(seed), SEEDS);
    assert.ok(SEEDS.includes(picked));
    assert.ok(isBookHealthy(book));
    assert.ok(bestBid(book) > 0 && bestAsk(book) > bestBid(book));
  }
});

test("every generated question has 4 distinct choices and the engine-correct answer", () => {
  let verified = 0;
  const seen = new Set();
  for (let seed = 1; seed <= 2000; seed += 1) {
    const { book } = generateInitialBook(rng(seed), SEEDS);
    const question = generateQuestion(rng(seed + 100000), book, pickSeed(seed));
    seen.add(question.type);
    assert.equal(new Set(question.choices.map((c) => c.label)).size, 4, `seed=${seed}`);
    const answer = question.choices[question.answerIndex].value;
    let expected;
    if (question.type === "bestAsk") expected = bestAsk(question.result.book);
    else if (question.type === "bestBid") expected = bestBid(question.result.book);
    else if (question.type === "spread") expected = spread(question.result.book);
    else if (question.type === "vwap") expected = Math.round(question.result.averagePrice);
    else {
      const side = question.event.side === "buy" ? "ask" : "bid";
      expected = depthAt(question.result.book, side, question.targetPrice);
    }
    assert.equal(answer, expected, `seed=${seed} type=${question.type}`);
    verified += 1;
  }
  assert.equal(verified, 2000);
  for (const type of ["bestAsk", "bestBid", "spread", "vwap", "depth"]) assert.ok(seen.has(type), `missing type ${type}`);
});

test("the user example: MARKET BUY 200 against a 100.04x150 / 100.06x200 ladder", () => {
  const book = { bids: [{ price: 10002, size: 250 }], asks: [{ price: 10004, size: 150 }, { price: 10006, size: 200 }] };
  const result = matchMarketOrder(book, "buy", 200);
  assert.equal(bestAsk(result.book), 10006);
  assert.equal(Math.round(result.averagePrice), 10005); // VWAP 100.045 -> 100.05
  assert.equal(depthAt(result.book, "ask", 10006), 150);
  assert.equal(formatPrice(bestAsk(result.book)), "100.06");
});

test("applying a run of events evolves the book cumulatively (no regen)", () => {
  const run = rng(42);
  let { book } = generateInitialBook(run, SEEDS);
  let events = 0;
  let resets = 0;
  for (let step = 0; step < 500; step += 1) {
    if (!isBookHealthy(book)) {
      const fresh = generateInitialBook(run, SEEDS);
      book = fresh.book;
      resets += 1;
      continue;
    }
    const question = generateQuestion(run, book, pickSeed(step));
    const updated = applyEvent(book, question.event);
    // the event's match result must describe exactly the next book state
    assert.deepEqual(updated, question.result.book);
    book = updated;
    events += 1;
    const ask = bestAsk(book);
    const bid = bestBid(book);
    if (ask !== undefined && bid !== undefined) assert.ok(ask > bid);
  }
  assert.ok(events > 300, `expected a long-lived run, got ${events} events`);
  assert.ok(resets > 0, "the book should eventually need a fresh one");
});

test("applyEvent never mutates the caller's book", () => {
  const { book } = generateInitialBook(rng(7), SEEDS);
  const before = JSON.stringify(book);
  const question = generateQuestion(rng(7), book, pickSeed(7));
  applyEvent(book, question.event);
  assert.equal(JSON.stringify(book), before);
});
