// @quantcraft/finmath · risk — pure portfolio-risk mathematics.
// Given per-leg Greeks (typically computed by @quantcraft/quantlibjs), this
// module aggregates book risk, measures its magnitude against a scale, finds
// the best subset of hedge tools, and scores hedge quality. Import from
// "@quantcraft/finmath" or "@quantcraft/finmath/risk".

export type GreekRisk = { delta: number; gamma: number; vega: number; theta: number; rho: number };
export type GreekKey = keyof GreekRisk;

export const GREEK_KEYS: GreekKey[] = ["delta", "gamma", "vega", "theta", "rho"];

export const GREEK_LABELS: Record<GreekKey, string> = {
  delta: "DELTA",
  gamma: "GAMMA",
  vega: "VEGA",
  theta: "THETA",
  rho: "RHO",
};

/** Tolerance used to make each Greek comparable on a common scale. */
export const DEFAULT_GREEK_SCALES: Record<GreekKey, number> = {
  delta: 0.35,
  gamma: 0.04,
  vega: 18,
  theta: 2,
  rho: 20,
};

export const zeroRisk = (): GreekRisk => ({ delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 });

export function addRisk(base: GreekRisk, change: GreekRisk): GreekRisk {
  return {
    delta: base.delta + change.delta,
    gamma: base.gamma + change.gamma,
    vega: base.vega + change.vega,
    theta: base.theta + change.theta,
    rho: base.rho + change.rho,
  };
}

/** Normalized risk magnitude: Euclidean length of each Greek scaled by its tolerance. */
export function riskMagnitude(
  greeks: GreekRisk,
  scales: Record<GreekKey, number> = DEFAULT_GREEK_SCALES,
  keys: GreekKey[] = GREEK_KEYS,
): number {
  return Math.hypot(...keys.map((key) => greeks[key] / scales[key]));
}

export type HedgeSearch<T> = {
  /** The subset of hedge tools that minimizes the book's risk magnitude. */
  bestTrades: T[];
  beforeRisk: number;
  bestRisk: number;
  /** Risk magnitude for an arbitrary book, using the search's scales and keys. */
  risk: (greeks: GreekRisk) => number;
};

/**
 * Enumerate every subset of hedge tools and return the one that minimizes
 * the combined book's risk magnitude. Ties keep the earlier (smaller)
 * subset. Tools are structurally GreekRisk (they may carry extra fields).
 */
export function bestHedge<T extends GreekRisk>({
  preTrade,
  trades,
  scales = DEFAULT_GREEK_SCALES,
  keys = GREEK_KEYS,
}: {
  preTrade: GreekRisk;
  trades: readonly T[];
  scales?: Record<GreekKey, number>;
  keys?: GreekKey[];
}): HedgeSearch<T> {
  const risk = (greeks: GreekRisk) => riskMagnitude(greeks, scales, keys);
  const beforeRisk = risk(preTrade);
  let bestTrades: T[] = [];
  let bestRisk = beforeRisk;
  for (let mask = 0; mask < 1 << trades.length; mask += 1) {
    const subset = trades.filter((_, index) => mask & (1 << index));
    const greeks = subset.reduce((sum, trade) => addRisk(sum, trade), preTrade);
    const candidate = risk(greeks);
    if (candidate < bestRisk) {
      bestRisk = candidate;
      bestTrades = subset;
    }
  }
  return { bestTrades, beforeRisk, bestRisk, risk };
}

/**
 * 0..1 quality of a chosen hedge relative to the best possible hedge.
 * `exactMatch` pins the score to 1 when the chosen subset is exactly the
 * best subset, which matters when no hedge improves the book at all.
 */
export function hedgeQuality({
  beforeRisk,
  chosenRisk,
  bestRisk,
  exactMatch = false,
}: {
  beforeRisk: number;
  chosenRisk: number;
  bestRisk: number;
  exactMatch?: boolean;
}): number {
  const availableImprovement = beforeRisk - bestRisk;
  if (availableImprovement <= 0.0001) return exactMatch ? 1 : 0;
  return Math.max(0, Math.min(1, (beforeRisk - chosenRisk) / availableImprovement));
}
