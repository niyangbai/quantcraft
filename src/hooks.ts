// hooks — shared React hooks for the game components.

import { useState } from "react";
import { secureSeed } from "./shared";

/**
 * The "seeded round" idiom every drill uses: a random seed that regenerates
 * the question on `nextSeed()`. `seededRandom(roundKey)` turns the seed back
 * into a deterministic rng for question generation.
 */
export function useSeededRound() {
  const [roundKey, setRoundKey] = useState(secureSeed);
  return { roundKey, nextSeed: () => setRoundKey(secureSeed()) };
}
