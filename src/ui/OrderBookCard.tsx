export type BookRow = {
  price: string;
  size: number;
  /** True when the level was consumed by the current market order. */
  hit?: boolean;
};

/**
 * A limit order book ladder: best ask at the top, spread in the middle,
 * best bid below. Prices arrive pre-formatted; the component is purely
 * presentational.
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
        <div className="order-side">
          <small>ASK</small>
          {asks.map((row) => (
            <div key={row.price} className={`book-row ${row.hit ? "hit" : ""}`}>
              <span>{row.price}</span>
              <b>{row.size}</b>
            </div>
          ))}
        </div>
        {spreadLabel && <div className="order-spread"><small>SPREAD</small><strong>{spreadLabel}</strong></div>}
        <div className="order-side">
          <small>BID</small>
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
