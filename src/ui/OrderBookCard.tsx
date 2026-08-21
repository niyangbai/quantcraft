export type BookRow = {
  price: string;
  size: number;
  /** True when the level was consumed by the current market order. */
  hit?: boolean;
};

/**
 * A limit order book ladder laid out like an exchange: asks (red) descend
 * toward the spread at the top, the spread sits in the middle, and bids
 * (green) descend away from the spread at the bottom. Prices arrive
 * pre-formatted; the component is purely presentational.
 */
export function OrderBookCard({
  asks,
  bids,
  spreadLabel,
}: {
  asks: BookRow[];
  bids: BookRow[];
  spreadLabel?: string;
}) {
  return (
    <article className="position-book order-book">
      <small>ORDER BOOK</small>
      <div className="order-ladder">
        <div className="book-col-head"><span>PRICE</span><span>SIZE</span></div>
        <div className="order-side asks">
          {asks.slice().reverse().map((row) => (
            <div key={row.price} className={`book-row ${row.hit ? "hit" : ""}`}>
              <span>{row.price}</span>
              <b>{row.size}</b>
            </div>
          ))}
        </div>
        {spreadLabel && <div className="order-spread"><small>SPREAD</small><strong>{spreadLabel}</strong></div>}
        <div className="order-side bids">
          {bids.map((row) => (
            <div key={row.price} className={`book-row ${row.hit ? "hit" : ""}`}>
              <span>{row.price}</span>
              <b>{row.size}</b>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
