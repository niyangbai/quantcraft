// hooks — shared React hooks for the game components.

import { useEffect, useRef, useState } from "react";
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

/**
 * Observe an element's rendered width so canvas charts can redraw at their
 * true display size — keeping tick labels legible on narrow screens and
 * reacting to orientation changes. Returns the ref to attach plus the width,
 * seeded with `defaultWidth` so the first paint doesn't wait for layout.
 */
export function useElementWidth<T extends HTMLElement>(defaultWidth: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(defaultWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || defaultWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [defaultWidth]);
  return [ref, width] as const;
}
