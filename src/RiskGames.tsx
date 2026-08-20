import { useEffect, useMemo, useRef, useState } from "react";
import type { QuantLibRuntime } from "@quantcraft/market-kernel";
import { RoundTimer } from "./Controls";
import { between, isoDate, market, secureSeed, seededRandom } from "./game";
import type { HedgeLeg, QuestionBank } from "./game";
import "./Greekthon.css";
import "./Hedge.css";

type GreekDirection = "down" | "unchanged" | "up";

const greekDirection = (before: number, after: number): GreekDirection => {
  const displayedBefore = Number(before.toFixed(4));
  const displayedAfter = Number(after.toFixed(4));
  if (displayedAfter === displayedBefore) return "unchanged";
  return displayedAfter > displayedBefore ? "up" : "down";
};

export function Greekthon({ ql, bank, onScore }: { ql?: QuantLibRuntime; bank: QuestionBank["greekthon"]; onScore: (score: number, correct: boolean, streak: number, label: string) => void }) {
  const REVIEW_DURATION_MS = 3000;
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
    return { scenario, book, metric: labels[metric], before, after, direction: greekDirection(before, after) };
  }, [ql, randomKey, bank]);
  const next = () => { setRandomKey(secureSeed()); setSeed((value) => value + 1); setAnswered(false); setFeedback(undefined); };
  const answer = (direction: GreekDirection) => {
    if (!question || answered) return;
    const correct = direction === question.direction;
    const nextStreak = correct ? streak + 1 : 0;
    const points = correct ? 100 + streak * 10 : -50;
    setAnswered(true); setFeedback(correct ? "correct" : "wrong"); setScore(v => v + points); setStreak(nextStreak);
    onScore(points, correct, nextStreak, `${question.metric} · ${question.book.name}`);
    setTimeout(next, REVIEW_DURATION_MS);
  };
  useEffect(() => {
    if (!question || answered) return;
    const timer = setTimeout(() => { setAnswered(true); setFeedback("timeout"); setScore(v => v - 50); setStreak(0); onScore(-50, false, 0, `${question.metric} · Time out`); setTimeout(next, REVIEW_DURATION_MS); }, duration);
    return () => clearTimeout(timer);
  }, [question, answered, duration, onScore]);
  return <section className="mode-view game-page greekthon"><div className="mode-header greekthon-head"><div><p className="eyebrow">GREEKTHON · FLASH ROUND</p><h1>Up, flat, or down?</h1></div><div className="header-tools"><div className="greek-stats"><span>SCORE<strong>{score}</strong></span><span>STREAK<strong>×{streak}</strong></span></div><RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(1)}s`} durationMs={duration} resetKey={seed} /></div></div><p className="mode-intro">Read the market shock, the position, and the requested metric. No calculator. Just direction.</p>{question ? <div className={`flashcard ${feedback ?? ""}`}><div className="flash-top"><span className="greek-chip">{question.metric}</span><span>ROUND {seed + 1}</span></div><div className="market-shock"><small>MARKET EVENT</small><strong>{question.scenario.label}</strong><span>{question.scenario.detail}</span></div><div className="position-book"><small>YOUR POSITION</small><h2>{question.book.name}</h2>{question.book.legs.map((leg, index) => <div key={`${leg.type}-${index}`}><b className={leg.qty > 0 ? "long" : "short"}>{leg.qty > 0 ? "LONG" : "SHORT"}</b><span>{Math.abs(leg.qty)}× {leg.strike} {leg.type.toUpperCase()}</span></div>)}</div><div className="flash-question">What happens to portfolio <strong>{question.metric}</strong>?</div>{answered ? <div className="flash-feedback"><strong>{feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG"}</strong><span>{question.before.toFixed(4)} → <b className={`metric-${question.direction}`}>{question.after.toFixed(4)}</b></span></div> : <div className="direction-buttons"><button onClick={() => answer("down")}>↓<span>GOES DOWN</span></button><button onClick={() => answer("unchanged")}>→<span>UNCHANGED</span></button><button onClick={() => answer("up")}>↑<span>GOES UP</span></button></div>}</div> : <div className="drop-zone">Preparing cards…</div>}</section>;
}

export function Hedge({ ql, bank, onScore }: { ql?: QuantLibRuntime; bank: QuestionBank["hedge"]; onScore: (score: number, passed: boolean, label: string) => void }) {
  const ROUND_SECONDS = 45;
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [selectedTrade, setSelectedTrade] = useState<string>();
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [result, setResult] = useState<{ passed: boolean; score: number; bestTradeId: string; delta: number; vega: number; timedOut: boolean }>();
  const settleRef = useRef<(timedOut?: boolean) => void>(() => undefined);
  const round = useMemo(() => {
    if (!ql) return undefined;
    const rng = seededRandom(roundKey);
    const template = bank.products[Math.floor(rng() * bank.products.length)];
    const shocks = [
      { label: "Risk-off selloff", spot: .82, vol: .13, detail: "Spot gaps lower and implied volatility jumps." },
      { label: "Relief rally", spot: 1.16, vol: -.05, detail: "Spot rallies while implied volatility softens." },
      { label: "Volatility shock", spot: .97, vol: .15, detail: "Spot is nearly unchanged, but volatility reprices sharply higher." },
      { label: "Volatility crush", spot: 1.02, vol: -.1, detail: "The catalyst passes and implied volatility collapses." },
    ];
    const shock = shocks[Math.floor(rng() * shocks.length)];
    const evaluation = new Date(Date.UTC(2025, 0, 2));
    evaluation.setUTCMonth(evaluation.getUTCMonth() + Math.floor(between(rng, 0, 36)));
    const maturity = new Date(evaluation);
    maturity.setUTCMonth(maturity.getUTCMonth() + Math.floor(between(rng, 18, 61)));
    const evaluationDate = isoDate(evaluation);
    const maturityDate = isoDate(maturity);
    const beforeSpot = Number(between(rng, 82, 128).toFixed(2));
    const beforeVolatility = Number(between(rng, .16, .32).toFixed(4));
    const spot = Number((beforeSpot * shock.spot).toFixed(2));
    const volatility = Number(Math.max(.06, beforeVolatility + shock.vol).toFixed(4));
    const rate = Number(between(rng, -0.005, 0.065).toFixed(4));
    const dividend = Number(between(rng, 0, 0.045).toFixed(4));
    const participation = between(rng, 0.65, 1.35);
    const legs = template.legs.map((leg) => ({
      ...leg,
      qty: Number((leg.qty * participation).toFixed(2)),
      strike: Number((beforeSpot * leg.strike / 100 * between(rng, 0.98, 1.02)).toFixed(2)),
    }));
    const price = (leg: HedgeLeg) => ql.priceEuropean({ evaluationDate, maturityDate, spot, strike: leg.strike, riskFreeRate: rate, dividendYield: dividend, volatility, type: leg.type });
    const client = legs.reduce((book, leg) => {
      const priced = price(leg);
      return { delta: book.delta + leg.qty * priced.delta, vega: book.vega + leg.qty * priced.vega };
    }, { delta: 0, vega: 0 });
    const preTrade = { delta: -client.delta, vega: -client.vega };
    const callStrike = Number((spot * 1.05).toFixed(2));
    const putStrike = Number((spot * .95).toFixed(2));
    const call = price({ type: "call", strike: callStrike, qty: 1 });
    const put = price({ type: "put", strike: putStrike, qty: 1 });
    const quantity = .5;
    const trades = [
      { id: "buy-stock", label: "BUY STOCK", detail: "+0.50 delta", delta: quantity, vega: 0 },
      { id: "sell-stock", label: "SELL STOCK", detail: "−0.50 delta", delta: -quantity, vega: 0 },
      { id: "buy-call", label: `BUY ${callStrike} CALL`, detail: "Long delta · long vega", delta: quantity * call.delta, vega: quantity * call.vega },
      { id: "sell-call", label: `SELL ${callStrike} CALL`, detail: "Short delta · short vega", delta: -quantity * call.delta, vega: -quantity * call.vega },
      { id: "buy-put", label: `BUY ${putStrike} PUT`, detail: "Short delta · long vega", delta: quantity * put.delta, vega: quantity * put.vega },
      { id: "sell-put", label: `SELL ${putStrike} PUT`, detail: "Long delta · short vega", delta: -quantity * put.delta, vega: -quantity * put.vega },
      { id: "hold", label: "DO NOTHING", detail: "Keep the current exposure", delta: 0, vega: 0 },
    ].map((trade) => ({
      ...trade,
      postDelta: preTrade.delta + trade.delta,
      postVega: preTrade.vega + trade.vega,
    }));
    const risk = (delta: number, vega: number) => Math.hypot(delta / .35, vega / 18);
    const beforeRisk = risk(preTrade.delta, preTrade.vega);
    const ranked = [...trades].sort((a, b) => risk(a.postDelta, a.postVega) - risk(b.postDelta, b.postVega));
    return { template, shock, maturityDate, beforeSpot, beforeVolatility, spot, volatility, legs, preTrade, trades, bestTrade: ranked[0], beforeRisk, bestRisk: risk(ranked[0].postDelta, ranked[0].postVega), risk };
  }, [ql, roundKey, bank]);
  const settle = (timedOut = false) => {
    if (!round || result || (!selectedTrade && !timedOut)) return;
    const trade = round.trades.find((candidate) => candidate.id === selectedTrade);
    const chosenRisk = trade ? round.risk(trade.postDelta, trade.postVega) : round.beforeRisk;
    const availableImprovement = round.beforeRisk - round.bestRisk;
    const quality = availableImprovement <= .0001
      ? Number(trade?.id === round.bestTrade.id)
      : Math.max(0, Math.min(1, (round.beforeRisk - chosenRisk) / availableImprovement));
    const passed = !timedOut && quality >= .8;
    const score = passed ? Math.round(100 + quality * 40 + secondsLeft * .4) : -50;
    setResult({ passed, score, bestTradeId: round.bestTrade.id, delta: trade?.postDelta ?? round.preTrade.delta, vega: trade?.postVega ?? round.preTrade.vega, timedOut });
    onScore(score, passed, `${round.template.name} · ${round.shock.label}`);
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
    setSelectedTrade(undefined);
    setSecondsLeft(ROUND_SECONDS);
    setResult(undefined);
  };
  if (!round) return <section className="mode-view game-page hedge"><div className="drop-zone">Preparing hedge book…</div></section>;
  const deltaLabel = round.preTrade.delta >= 0 ? "LONG DELTA" : "SHORT DELTA";
  const vegaLabel = round.preTrade.vega >= 0 ? "LONG VEGA" : "SHORT VEGA";
  const bestTrade = round.trades.find((trade) => trade.id === result?.bestTradeId);
  return (
    <section className="mode-view hedge">
      <div className="mode-header hedge-head">
        <div><p className="eyebrow">HEDGE · MARKET INTUITION</p><h1>Read the shock. Pick the trade.</h1></div>
        <RoundTimer label="MARKET CLOSE" value={`${secondsLeft}s`} progress={secondsLeft / ROUND_SECONDS * 100} urgent={secondsLeft <= 10} />
      </div>
      <section className="game-context-grid">
        <article className="game-context-card question-context">
          <p className="panel-label">MARKET EVENT</p>
          <h2>{round.shock.label}</h2>
          <p>{round.shock.detail} Choose the response that best reduces the dealer's combined Delta and Vega risk.</p>
        </article>
        <article className="game-context-card market-context">
          <p className="panel-label">BEFORE → AFTER</p>
          <div className="market-snapshot">
            <span>SPOT<strong>{round.beforeSpot.toFixed(2)} → {round.spot.toFixed(2)}</strong></span><span>VOL<strong>{(round.beforeVolatility * 100).toFixed(1)}% → {(round.volatility * 100).toFixed(1)}%</strong></span><span>MATURITY<strong>{round.maturityDate}</strong></span>
          </div>
        </article>
      </section>
      <div className="hedge-layout">
        <article className="hedge-product">
          <small>CLIENT PRODUCT · DEALER SHORT</small><h2>{round.template.name}</h2><p>{round.template.description}</p>
          <div className="hedge-legs"><span>{round.template.extra}</span>{round.legs.map((leg, index) => <span key={`${leg.type}-${index}`}>{leg.qty > 0 ? "LONG" : "SHORT"} {Math.abs(leg.qty)}× {leg.strike} {leg.type.toUpperCase()}</span>)}</div>
          <div className="risk-signals"><small>DEALER RISK AFTER SHOCK</small><strong className={round.preTrade.delta >= 0 ? "positive" : "negative"}>{deltaLabel}</strong><strong className={round.preTrade.vega >= 0 ? "positive" : "negative"}>{vegaLabel}</strong></div>
        </article>
        <article className="hedge-ticket">
          <h2>Choose the best response</h2>
          <div className="trade-choices">{round.trades.map((trade) => <button key={trade.id} className={selectedTrade === trade.id ? "selected" : ""} onClick={() => setSelectedTrade(trade.id)} disabled={Boolean(result)}><strong>{trade.label}</strong><small>{trade.detail}</small></button>)}</div>
        </article>
      </div>
      {result && <div className="hedge-reveal"><div><span>BEFORE</span><strong>Δ {round.preTrade.delta.toFixed(3)}</strong><strong>V {round.preTrade.vega.toFixed(2)}</strong></div><div><span>AFTER YOUR TRADE</span><strong>Δ {result.delta.toFixed(3)}</strong><strong>V {result.vega.toFixed(2)}</strong></div><p>{result.passed ? "Good call. Your trade offsets the book's dominant exposures." : result.timedOut ? `Best response: ${bestTrade?.label}.` : `That trade leaves more combined risk. Best response: ${bestTrade?.label}.`}</p></div>}
      {result ? <div className={`hedge-result ${result.passed ? "passed" : "failed"}`}><div><small>{result.passed ? "RISK REDUCED" : result.timedOut ? "MARKET CLOSED" : "RISK NOT IMPROVED"}</small><strong>{result.score >= 0 ? "+" : ""}{result.score} PTS</strong></div><button onClick={next}>NEXT SHOCK →</button></div> : <div className="action-row submit-only"><button className="primary-action game-primary" disabled={!selectedTrade} onClick={() => settle(false)}>COMMIT TRADE <span>→</span></button></div>}
    </section>
  );
}
