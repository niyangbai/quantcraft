import { useEffect, useMemo, useRef, useState } from "react";
import type { QuantLibRuntime } from "@quantcraft/market-kernel";
import { RoundTimer } from "./Controls";
import { between, isoDate, market, secureSeed, seededRandom } from "./game";
import type { HedgeLeg, QuestionBank } from "./game";
import "./Greekthon.css";
import "./Hedge.css";

export function Greekthon({ ql, bank, onScore }: { ql?: QuantLibRuntime; bank: QuestionBank["greekthon"]; onScore: (score: number, correct: boolean, streak: number, label: string) => void }) {
  const [seed, setSeed] = useState(0);
  const [randomKey, setRandomKey] = useState(secureSeed);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const duration = Math.max(2600, 8500 - streak * 550);
  const question = useMemo(() => {
    if (!ql) return undefined;
    const { scenarios, books, metrics } = bank;
    const rng = seededRandom(randomKey);
    const scenarioTemplate = scenarios[Math.floor(rng() * scenarios.length)];
    const bookTemplate = books[Math.floor(rng() * books.length)];
    const metric = metrics[Math.floor(rng() * metrics.length)];
    const baseSpot = Math.round(between(rng, 80, 125));
    const baseVol = Number(between(rng, .12, .36).toFixed(4));
    const baseRate = Number(between(rng, .005, .06).toFixed(4));
    const dividend = Number(between(rng, 0, .035).toFixed(4));
    const afterSpot = Number((baseSpot * scenarioTemplate.spot / 100).toFixed(2));
    const afterVol = Math.max(.03, Number((baseVol * scenarioTemplate.vol / .2).toFixed(4)));
    const afterRate = Number((baseRate + scenarioTemplate.rate - .025).toFixed(4));
    const scenarioDate = new Date(`${scenarioTemplate.date}T00:00:00Z`);
    const monthShift = (scenarioDate.getUTCFullYear() - 2025) * 12 + scenarioDate.getUTCMonth();
    const afterDate = new Date("2025-01-02T00:00:00Z");
    afterDate.setUTCMonth(afterDate.getUTCMonth() + monthShift);
    const scale = baseSpot / 100;
    const book = { ...bookTemplate, legs: bookTemplate.legs.map((leg) => ({ ...leg, strike: Math.round(leg.strike * scale) })) };
    const scenario = { ...scenarioTemplate, spot: afterSpot, vol: afterVol, rate: afterRate, date: isoDate(afterDate), detail: `S ${baseSpot}→${afterSpot} · Vol ${(baseVol * 100).toFixed(1)}→${(afterVol * 100).toFixed(1)}% · R ${(baseRate * 100).toFixed(2)}→${(afterRate * 100).toFixed(2)}%` };
    const labels = { value: "FAIR VALUE", delta: "DELTA", gamma: "GAMMA", vega: "VEGA", theta: "THETA", rho: "RHO" };
    const evaluate = (spot: number, vol: number, rate: number, date: string) => book.legs.reduce((sum, leg) => {
      const result = ql.priceEuropean({ evaluationDate: date, maturityDate: market.maturityDate, spot, strike: leg.strike, riskFreeRate: rate, dividendYield: dividend, volatility: vol, type: leg.type });
      return sum + leg.qty * result[metric];
    }, 0);
    const before = evaluate(baseSpot, baseVol, baseRate, "2025-01-02");
    const after = evaluate(scenario.spot, scenario.vol, scenario.rate, scenario.date);
    return { scenario, book, metric: labels[metric], before, after, rises: after > before };
  }, [ql, randomKey, bank]);
  const next = () => { setRandomKey(secureSeed()); setSeed((value) => value + 1); setAnswered(false); setFeedback(undefined); };
  const answer = (rises: boolean) => {
    if (!question || answered) return;
    const correct = rises === question.rises;
    const nextStreak = correct ? streak + 1 : 0;
    const points = correct ? 100 + streak * 10 : -50;
    setAnswered(true); setFeedback(correct ? "correct" : "wrong"); setScore(v => v + points); setStreak(nextStreak);
    onScore(points, correct, nextStreak, `${question.metric} · ${question.book.name}`);
    setTimeout(next, 700);
  };
  useEffect(() => {
    if (!question || answered) return;
    const timer = setTimeout(() => { setAnswered(true); setFeedback("timeout"); setScore(v => v - 50); setStreak(0); onScore(-50, false, 0, `${question.metric} · Time out`); setTimeout(next, 700); }, duration);
    return () => clearTimeout(timer);
  }, [question, answered, duration, onScore]);
  return <section className="mode-view game-page greekthon"><div className="mode-header greekthon-head"><div><p className="eyebrow">GREEKTHON · FLASH ROUND</p><h1>Up or down?</h1></div><div className="header-tools"><div className="greek-stats"><span>SCORE<strong>{score}</strong></span><span>STREAK<strong>×{streak}</strong></span></div><RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(1)}s`} durationMs={duration} resetKey={seed} /></div></div><p className="mode-intro">Read the market shock, the position, and the requested metric. No calculator. Just direction.</p>{question ? <div className={`flashcard ${feedback ?? ""}`}><div className="flash-top"><span className="greek-chip">{question.metric}</span><span>ROUND {seed + 1}</span></div><div className="market-shock"><small>MARKET EVENT</small><strong>{question.scenario.label}</strong><span>{question.scenario.detail}</span></div><div className="position-book"><small>YOUR POSITION</small><h2>{question.book.name}</h2>{question.book.legs.map((leg, index) => <div key={`${leg.type}-${index}`}><b className={leg.qty > 0 ? "long" : "short"}>{leg.qty > 0 ? "LONG" : "SHORT"}</b><span>{Math.abs(leg.qty)}× {leg.strike} {leg.type.toUpperCase()}</span></div>)}</div><div className="flash-question">What happens to portfolio <strong>{question.metric}</strong>?</div>{answered ? <div className="flash-feedback"><strong>{feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG"}</strong><span>{question.before.toFixed(4)} → {question.after.toFixed(4)}</span></div> : <div className="direction-buttons"><button onClick={() => answer(false)}>↓<span>GOES DOWN</span></button><button onClick={() => answer(true)}>↑<span>GOES UP</span></button></div>}</div> : <div className="drop-zone">Preparing cards…</div>}</section>;
}

export function Hedge({ ql, bank, onScore }: { ql?: QuantLibRuntime; bank: QuestionBank["hedge"]; onScore: (score: number, passed: boolean, label: string) => void }) {
  const ROUND_SECONDS = 60;
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [stockSide, setStockSide] = useState<"buy" | "sell">("buy");
  const [stockQty, setStockQty] = useState(0);
  const [optionSide, setOptionSide] = useState<"buy" | "sell">("buy");
  const [optionQty, setOptionQty] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [result, setResult] = useState<{ passed: boolean; score: number; delta: number; vega: number; cost: number }>();
  const settleRef = useRef<(timedOut?: boolean) => void>(() => undefined);
  const round = useMemo(() => {
    if (!ql) return undefined;
    const rng = seededRandom(roundKey);
    const template = bank.products[Math.floor(rng() * bank.products.length)];
    const events = ["Spot gap", "Volatility repricing", "Month-end rebalance", "Client unwind window", "Risk-limit review"];
    const event = events[Math.floor(rng() * events.length)];
    const evaluation = new Date(Date.UTC(2025, 0, 2));
    evaluation.setUTCMonth(evaluation.getUTCMonth() + Math.floor(between(rng, 0, 36)));
    const maturity = new Date(evaluation);
    maturity.setUTCMonth(maturity.getUTCMonth() + Math.floor(between(rng, 18, 61)));
    const evaluationDate = isoDate(evaluation);
    const maturityDate = isoDate(maturity);
    const spot = Number(between(rng, 72, 138).toFixed(2));
    const volatility = Number(between(rng, 0.11, 0.48).toFixed(4));
    const rate = Number(between(rng, -0.005, 0.065).toFixed(4));
    const dividend = Number(between(rng, 0, 0.045).toFixed(4));
    const participation = between(rng, 0.65, 1.35);
    const legs = template.legs.map((leg) => ({
      ...leg,
      qty: Number((leg.qty * participation).toFixed(2)),
      strike: Number((spot * leg.strike / 100 * between(rng, 0.98, 1.02)).toFixed(2)),
    }));
    const hedgeStrike = Number((spot * between(rng, 0.95, 1.05)).toFixed(2));
    const hedgeType: "call" | "put" = rng() < 0.5 ? "call" : "put";
    const price = (leg: HedgeLeg) => ql.priceEuropean({ evaluationDate, maturityDate, spot, strike: leg.strike, riskFreeRate: rate, dividendYield: dividend, volatility, type: leg.type });
    const client = legs.reduce((book, leg) => {
      const priced = price(leg);
      return { delta: book.delta + leg.qty * priced.delta, vega: book.vega + leg.qty * priced.vega };
    }, { delta: 0, vega: 0 });
    const hedgeOption = price({ type: hedgeType, strike: hedgeStrike, qty: 1 });
    const existingStock = Number(between(rng, -0.45, 0.45).toFixed(2));
    const existingOption = Number(between(rng, -0.45, 0.45).toFixed(2));
    const preTrade = {
      delta: -client.delta + existingStock + existingOption * hedgeOption.delta,
      vega: -client.vega + existingOption * hedgeOption.vega,
    };
    return { template, event, evaluationDate, maturityDate, spot, volatility, rate, dividend, legs, hedgeStrike, hedgeType, hedgeOption, existingStock, existingOption, preTrade };
  }, [ql, roundKey, bank]);
  const signedStock = (stockSide === "buy" ? 1 : -1) * stockQty;
  const signedOption = (optionSide === "buy" ? 1 : -1) * optionQty;
  const postTrade = round ? {
    delta: round.preTrade.delta + signedStock + signedOption * round.hedgeOption.delta,
    vega: round.preTrade.vega + signedOption * round.hedgeOption.vega,
    cost: signedStock * round.spot + signedOption * round.hedgeOption.value,
  } : undefined;
  const settle = (timedOut = false) => {
    if (!round || !postTrade || result) return;
    const passed = !timedOut && Math.abs(postTrade.delta) <= 0.05 && Math.abs(postTrade.vega) <= 1;
    const riskPenalty = Math.min(140, Math.abs(postTrade.delta) * 90 + Math.abs(postTrade.vega) * 2.5);
    const turnoverPenalty = Math.min(24, stockQty * 2 + optionQty * 4);
    const score = timedOut ? -50 : Math.round(140 - riskPenalty - turnoverPenalty + secondsLeft * 0.4);
    setResult({ passed, score, delta: postTrade.delta, vega: postTrade.vega, cost: postTrade.cost });
    onScore(score, passed, `${round.template.name} · Desk ticket`);
  };
  useEffect(() => {
    settleRef.current = settle;
  });
  useEffect(() => {
    if (!round || result || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((value) => value - 1);
      if (secondsLeft === 1) settleRef.current(true);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, round, result]);
  const next = () => {
    setRoundKey(secureSeed());
    setStockSide("buy");
    setStockQty(0);
    setOptionSide("buy");
    setOptionQty(0);
    setSecondsLeft(ROUND_SECONDS);
    setResult(undefined);
  };
  if (!round || !postTrade) return <section className="mode-view game-page hedge"><div className="drop-zone">Preparing hedge book…</div></section>;
  const optionLabel = `${round.hedgeStrike} ${round.hedgeType.toUpperCase()}`;
  return (
    <section className="mode-view hedge">
      <div className="mode-header hedge-head">
        <div><p className="eyebrow">HEDGE · DELTA ONE DESK</p><h1>Work the risk ticket.</h1></div>
        <RoundTimer label="MARKET CLOSE" value={`${secondsLeft}s`} progress={secondsLeft / ROUND_SECONDS * 100} urgent={secondsLeft <= 10} />
      </div>
      <section className="game-context-grid">
        <article className="game-context-card question-context">
          <p className="panel-label">QUESTION · DESK MANDATE</p>
          <h2>Hedge the {round.template.name}</h2>
          <p>{round.event}. Rebalance the existing dealer hedge and submit one ticket to Risk. Post-trade residuals stay hidden until submission.</p>
          <div className="hedge-aim"><span>AIM</span><strong>DELTA ±0.05</strong><strong>VEGA ±1.00</strong></div>
        </article>
        <article className="game-context-card market-context">
          <p className="panel-label">CURRENT MARKET</p>
          <div className="market-snapshot">
            <span>POINT<strong>{round.evaluationDate}</strong></span><span>MATURITY<strong>{round.maturityDate}</strong></span><span>SPOT<strong>{round.spot.toFixed(2)}</strong></span>
            <span>VOL<strong>{(round.volatility * 100).toFixed(1)}%</strong></span><span>RATE<strong>{(round.rate * 100).toFixed(2)}%</strong></span><span>DIVIDEND<strong>{(round.dividend * 100).toFixed(2)}%</strong></span>
          </div>
        </article>
      </section>
      <div className="hedge-layout">
        <article className="hedge-product">
          <small>CLIENT PRODUCT · DEALER SHORT</small><h2>{round.template.name}</h2><p>{round.template.description}</p>
          <div className="hedge-legs"><span>{round.template.extra}</span>{round.legs.map((leg, index) => <span key={`${leg.type}-${index}`}>{leg.qty > 0 ? "LONG" : "SHORT"} {Math.abs(leg.qty)}× {leg.strike} {leg.type.toUpperCase()}</span>)}</div>
          <div className="existing-book"><small>EXISTING HEDGE</small><span>{round.existingStock >= 0 ? "LONG" : "SHORT"} {Math.abs(round.existingStock).toFixed(2)}× STOCK</span><span>{round.existingOption >= 0 ? "LONG" : "SHORT"} {Math.abs(round.existingOption).toFixed(2)}× {optionLabel}</span></div>
          <div className="dealer-risk"><span>PRE-TRADE DELTA<strong>{round.preTrade.delta.toFixed(4)}</strong></span><span>PRE-TRADE VEGA<strong>{round.preTrade.vega.toFixed(2)}</strong></span></div>
        </article>
        <article className="hedge-ticket">
          <small>EXECUTION BLOTTER</small><h2>New hedge trades</h2>
          <div className="quote-sheet"><span>INSTRUMENT</span><span>PRICE</span><span>DELTA</span><span>VEGA</span><strong>STOCK</strong><b>{round.spot.toFixed(2)}</b><b>1.0000</b><b>0.00</b><strong>{optionLabel}</strong><b>{round.hedgeOption.value.toFixed(2)}</b><b>{round.hedgeOption.delta.toFixed(4)}</b><b>{round.hedgeOption.vega.toFixed(2)}</b></div>
          <div className="ticket-row"><strong>STOCK</strong><select value={stockSide} onChange={(event) => setStockSide(event.target.value as "buy" | "sell")} disabled={Boolean(result)}><option value="buy">BUY</option><option value="sell">SELL</option></select><input aria-label="Stock quantity" type="number" min="0" max="3" step="0.01" value={stockQty} onChange={(event) => setStockQty(Math.min(3, Math.max(0, Number(event.target.value))))} disabled={Boolean(result)} /></div>
          <div className="ticket-row"><strong>{optionLabel}</strong><select value={optionSide} onChange={(event) => setOptionSide(event.target.value as "buy" | "sell")} disabled={Boolean(result)}><option value="buy">BUY</option><option value="sell">SELL</option></select><input aria-label="Option quantity" type="number" min="0" max="5" step="0.01" value={optionQty} onChange={(event) => setOptionQty(Math.min(5, Math.max(0, Number(event.target.value))))} disabled={Boolean(result)} /></div>
          <div className="ticket-notice">POST-TRADE RISK HIDDEN <strong>{stockQty + optionQty > 0 ? "TICKET READY" : "ENTER ORDERS"}</strong></div>
        </article>
      </div>
      {result && <div className="residual-grid"><div className={Math.abs(result.delta) <= 0.05 ? "inside" : "outside"}><span>POST-TRADE DELTA</span><strong>{result.delta.toFixed(4)}</strong><small>limit ±0.05</small></div><div className={Math.abs(result.vega) <= 1 ? "inside" : "outside"}><span>POST-TRADE VEGA</span><strong>{result.vega.toFixed(2)}</strong><small>limit ±1.00</small></div></div>}
      {result ? <div className={`hedge-result ${result.passed ? "passed" : "failed"}`}><div><small>{result.passed ? "RISK ACCEPTED" : secondsLeft <= 0 ? "MARKET CLOSED" : "LIMIT BREACH"}</small><strong>{result.score >= 0 ? "+" : ""}{result.score} PTS · CASH {result.cost.toFixed(2)}</strong></div><button onClick={next}>NEXT BOOK →</button></div> : <div className="action-row submit-only"><button className="primary-action game-primary" disabled={stockQty + optionQty === 0} onClick={() => settle(false)}>SUBMIT TO RISK <span>→</span></button></div>}
    </section>
  );
}
