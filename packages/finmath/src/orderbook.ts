// @quantcraft/finmath · orderbook — deterministic limit-order-book matching.
// A market order fills against the best resting levels first, consuming size
// price-first (best price, then time — the time dimension is the aggregated
// size already resting at each price level). Import from
// "@quantcraft/finmath" or "@quantcraft/finmath/orderbook".

export type BookLevel = { price: number; size: number };

export type OrderBook = {
  /** Bids sorted best-first (highest price) after construction. */
  bids: BookLevel[];
  /** Asks sorted best-first (lowest price) after construction. */
  asks: BookLevel[];
};

export type OrderSide = "buy" | "sell";

export type BookSide = "bid" | "ask";

export type Fill = { price: number; size: number };

export type MatchResult = {
  /** The updated book after the market order executes. */
  book: OrderBook;
  /** The resting levels consumed, best-first. */
  fills: Fill[];
  /** Quantity filled. */
  filledSize: number;
  /** Quantity that could not be filled (book exhausted). */
  remainingSize: number;
  /** Volume-weighted average fill price. */
  averagePrice: number;
};

export const bestBid = (book: OrderBook): number | undefined => book.bids[0]?.price;

export const bestAsk = (book: OrderBook): number | undefined => book.asks[0]?.price;

export const spread = (book: OrderBook): number | undefined => {
  const ask = bestAsk(book);
  const bid = bestBid(book);
  return ask !== undefined && bid !== undefined ? ask - bid : undefined;
};

export const mid = (book: OrderBook): number | undefined => {
  const ask = bestAsk(book);
  const bid = bestBid(book);
  return ask !== undefined && bid !== undefined ? (ask + bid) / 2 : undefined;
};

/** Size resting at a price on a given side of the book (0 when no such level). */
export function depthAt(book: OrderBook, side: BookSide, price: number): number {
  const levels = side === "bid" ? book.bids : book.asks;
  return levels.find((level) => level.price === price)?.size ?? 0;
}

/**
 * Execute a market order with price-time priority. A buy consumes asks from
 * the best (lowest) up; a sell consumes bids from the best (highest) down.
 * Levels that are fully consumed are removed. The input book is not mutated.
 */
export function matchMarketOrder(book: OrderBook, side: OrderSide, size: number): MatchResult {
  const levels = side === "buy" ? book.asks : book.bids;
  const fills: Fill[] = [];
  let remaining = size;
  for (const level of levels) {
    if (remaining <= 0) break;
    const taken = Math.min(level.size, remaining);
    fills.push({ price: level.price, size: taken });
    remaining -= taken;
  }
  const filledSize = size - remaining;
  const averagePrice = filledSize
    ? fills.reduce((sum, fill) => sum + fill.price * fill.size, 0) / filledSize
    : 0;
  const updatedLevels = levels
    .map((level, index) => ({ price: level.price, size: level.size - (fills[index]?.size ?? 0) }))
    .filter((level) => level.size > 0);
  const bookAfter: OrderBook = side === "buy"
    ? { bids: book.bids, asks: updatedLevels }
    : { bids: updatedLevels, asks: book.asks };
  return { book: bookAfter, fills, filledSize, remainingSize: remaining, averagePrice };
}
