// shared — deterministic PRNG and stateless drill helpers.
//
// Every game module reuses the same seeded-random utilities and the same
// flash-drill scoring / timing formulas, so they live here once. This module
// is a leaf: it imports nothing from the app, so no game module introduces a
// circular dependency by importing it.

export type Rng = () => number;

/** Cryptographically random 32-bit seed. */
export const secureSeed = (): number => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
};

/** Deterministic PRNG (mulberry32) from an integer seed. */
export const seededRandom = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/** Uniform float in [min, max). */
export const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

/** Uniform element from a non-empty array. */
export const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** Uniform integer in [min, max]. */
export const integer = (rng: Rng, min: number, max: number): number => Math.round(between(rng, min, max));

/** `true` with the given probability. */
export const chance = (rng: Rng, probability: number): boolean => rng() < probability;

/** Fisher–Yates shuffle (non-mutating). */
export const shuffle = <T,>(rng: Rng, items: readonly T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

/** Decision window for flash drills: shrinks with streak, floored to `floor` ms. */
export const flashDrillDurationMs = (streak: number, floor = 4500, start = 10000, perStreak = 250): number =>
  Math.max(floor, start - streak * perStreak);

/** Points and resulting streak for a flash-drill answer. */
export const flashRoundScore = (streak: number, correct: boolean): { points: number; nextStreak: number } =>
  correct ? { points: 100 + streak * 10, nextStreak: streak + 1 } : { points: -50, nextStreak: 0 };
