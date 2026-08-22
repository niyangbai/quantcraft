import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { analyzeQuote } from "@quantcraft/finmath";
import { buildMakeMarketPrompt, generateMakeMarketRound, inventoryText, makeMarketDurationMs } from "./dist/games/make-market/game.js";

const moduleUrl = new URL("../packages/quantlibjs/wasm/quantlib.mjs", import.meta.url);
const wasmUrl = fileURLToPath(new URL("../packages/quantlibjs/wasm/quantlib.wasm", import.meta.url));
const ql = await QuantLibRuntime.create({ moduleUrl, wasmUrl });
const qlStats = { cdf: (x) => ql.normalCdf(x), pdf: (x) => ql.normalPdf(x) };

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

test("generator always yields 4 distinct quotes with the max-utility answer", () => {
  for (let seed = 1; seed <= 4000; seed += 1) {
    const round = generateMakeMarketRound(rng(seed), ql);
    const labels = round.choices.map((choice) => choice.label);
    assert.equal(new Set(labels).size, 4, `seed=${seed}: choices must be distinct`);
    assert.ok(round.answerIndex >= 0 && round.answerIndex < 4, `seed=${seed}: answer index in range`);

    // the machine's answer must be the max-utility quote when re-scored
    const context = { fairValue: round.fairValue, inventory: round.inventory, uncertainty: round.uncertainty, ...round.params };
    const utilities = round.choices.map((choice) => analyzeQuote(choice.quote, context, qlStats).utility);
    const bestIndex = utilities.indexOf(Math.max(...utilities));
    assert.equal(round.answerIndex, bestIndex, `seed=${seed}`);
    // no near-ties: the gap to the runner-up is meaningful
    assert.ok(utilities[bestIndex] - [...utilities].sort((a, b) => b - a)[1] > 1e-9, `seed=${seed}: unique winner`);
  }
});

test("a long inventory favors the sell side; a short favors the buy side", () => {
  let longChecks = 0;
  let shortChecks = 0;
  for (let seed = 1; seed <= 2000; seed += 1) {
    const round = generateMakeMarketRound(rng(seed), ql);
    const { analysis } = round;
    if (round.inventory > 0 && analysis.inventoryPenalty < 0) {
      // the winning quote for a long reduces exposure: ask closer to fair than the bid
      assert.ok(analysis.askDistance <= analysis.bidDistance, `seed=${seed} q=${round.inventory}: long should quote a tighter ask`);
      longChecks += 1;
    }
    if (round.inventory < 0 && analysis.inventoryPenalty < 0) {
      assert.ok(analysis.bidDistance <= analysis.askDistance, `seed=${seed} q=${round.inventory}: short should quote a tighter bid`);
      shortChecks += 1;
    }
  }
  assert.ok(longChecks > 0, "expected inventory-reducing rounds for longs");
  assert.ok(shortChecks > 0, "expected inventory-reducing rounds for shorts");
});

test("at meaningful positions the winner leans to reduce inventory", () => {
  // With a big position the inventory term is decisive: a long quotes to sell
  // (tighter ask), a short quotes to buy (tighter bid) in ~99% of rounds; the
  // rare exceptions are draws without a lean template where spread economics
  // win, which the model is free to choose.
  let q12plus = 0;
  let wrongDirection = 0;
  for (let seed = 1; seed <= 10000; seed += 1) {
    const round = generateMakeMarketRound(rng(seed), ql);
    const { analysis } = round;
    if (Math.abs(round.inventory) >= 12) {
      q12plus += 1;
      if (round.inventory > 0 && !(analysis.askDistance <= analysis.bidDistance)) wrongDirection += 1;
      if (round.inventory < 0 && !(analysis.bidDistance <= analysis.askDistance)) wrongDirection += 1;
    }
  }
  assert.ok(q12plus > 500, "expected enough large-position rounds to matter");
  assert.ok(wrongDirection / q12plus < 0.05, `wrong direction in ${wrongDirection}/${q12plus} large-position rounds`);
});

test("market parameters stay within the game's supported ranges", () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const round = generateMakeMarketRound(rng(seed), ql);
    assert.ok(round.fairValue >= 80 && round.fairValue <= 120);
    assert.ok([0.05, 0.1, 0.15, 0.2, 0.25].includes(round.uncertainty));
    assert.notEqual(round.inventory, 0);
    assert.ok(Math.abs(round.inventory) <= 16 && Math.abs(round.inventory) % 2 === 0);
    round.choices.forEach((choice) => {
      assert.ok(choice.quote.bid < choice.quote.ask, `${choice.label}: bid below ask`);
      assert.ok(choice.quote.bid < round.fairValue && choice.quote.ask > round.fairValue, `${choice.label}: quote straddles fair`);
    });
  }
});

test("decision window shortens with streak and floors", () => {
  assert.equal(makeMarketDurationMs(0), 10000);
  assert.ok(makeMarketDurationMs(2) < makeMarketDurationMs(0));
  assert.equal(makeMarketDurationMs(50), 4500);
});

test("inventoryText and the AI prompt carry the market facts", () => {
  assert.equal(inventoryText(40), "+40 LONG");
  assert.equal(inventoryText(-12), "-12 SHORT");
  const round = generateMakeMarketRound(rng(7), ql);
  const prompt = buildMakeMarketPrompt(round, "vp");
  assert.ok(prompt.includes(`fair value ${round.fairValue.toFixed(2)}`));
  assert.ok(prompt.includes(round.answerText));
  assert.ok(prompt.includes(`uncertainty ${round.uncertainty.toFixed(2)}`));
  assert.ok(round.explanation.includes(round.answerText));
});
