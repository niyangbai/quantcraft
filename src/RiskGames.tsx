import { useEffect, useMemo, useRef, useState } from "react";
import type { QuantLibRuntime } from "@quantcraft/market-kernel";
import { AiPromptModal, RoundResult, RoundTimer } from "./ui";
import { between, isoDate, market, secureSeed, seededRandom } from "./game";
import type { HedgeLeg, QuestionBank, Scoreboard } from "./game";
import { ChoiceGrid, GameFrame, PositionBook, RevealBar, ScenarioCard } from "./ui";

type GreekDirection = "down" | "unchanged" | "up";
type GreekRisk = { delta: number; gamma: number; vega: number; theta: number; rho: number };
type GreekKey = keyof GreekRisk;
const greekLabels: Record<GreekKey, string> = { delta: "DELTA", gamma: "GAMMA", vega: "VEGA", theta: "THETA", rho: "RHO" };
const addRisk = (base: GreekRisk, change: GreekRisk): GreekRisk => ({
  delta: base.delta + change.delta,
  gamma: base.gamma + change.gamma,
  vega: base.vega + change.vega,
  theta: base.theta + change.theta,
  rho: base.rho + change.rho,
});

const displayedDirection = (before: number, after: number, precision: number): GreekDirection => {
  const displayedBefore = Number(before.toFixed(precision));
  const displayedAfter = Number(after.toFixed(precision));
  if (displayedAfter === displayedBefore) return "unchanged";
  return displayedAfter > displayedBefore ? "up" : "down";
};

const greekDirection = (before: number, after: number) => displayedDirection(before, after, 4);

const metricToneClass = (direction: GreekDirection): string =>
  direction === "up" ? "tone-positive" : direction === "down" ? "tone-negative" : "tone-flat";

const DIRECTIONS: { key: GreekDirection; label: string; detail: string; tone: "down" | "flat" | "up" }[] = [
  { key: "down", label: "↓", detail: "GOES DOWN", tone: "down" },
  { key: "unchanged", label: "→", detail: "UNCHANGED", tone: "flat" },
  { key: "up", label: "↑", detail: "GOES UP", tone: "up" },
];

const greekLines = (greeks: GreekRisk) => (
  <>
    <span>Δ {greeks.delta.toFixed(3)}</span>
    <span>Γ {greeks.gamma.toFixed(3)}</span>
    <span>V {greeks.vega.toFixed(2)}</span>
    <span>Θ {greeks.theta.toFixed(2)}</span>
    <span>ρ {greeks.rho.toFixed(2)}</span>
  </>
);

export function Greekthon({ ql, bank, onScore, onBack, scoreboard }: { ql?: QuantLibRuntime; bank: QuestionBank["greekthon"]; onScore: (score: number, correct: boolean, streak: number, label: string) => void; onBack: () => void; scoreboard: Scoreboard }) {
  const REVIEW_DURATION_MS = 3000;
  const [seed, setSeed] = useState(0);
  const [randomKey, setRandomKey] = useState(secureSeed);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const duration = Math.max(2600, 8500 - scoreboard.streak * 550);
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
    const scenario = { ...scenarioTemplate, spot: afterSpot, vol: afterVol, rate: afterRate, date: isoDate(afterDate) };
    const marketMove = {
      beforeSpot: baseSpot,
      afterSpot,
      beforeVolatility: baseVol,
      afterVolatility: afterVol,
      beforeRate: baseRate,
      afterRate,
      spotDirection: displayedDirection(baseSpot, afterSpot, 2),
      volatilityDirection: displayedDirection(baseVol * 100, afterVol * 100, 1),
      rateDirection: displayedDirection(baseRate * 100, afterRate * 100, 2),
    };
    const labels = { value: "FAIR VALUE", delta: "DELTA", gamma: "GAMMA", vega: "VEGA", theta: "THETA", rho: "RHO" };
    const evaluate = (spot: number, vol: number, rate: number, date: string) => book.legs.reduce((sum, leg) => {
      const result = ql.priceEuropean({ evaluationDate: date, maturityDate: market.maturityDate, spot, strike: leg.strike, riskFreeRate: rate, dividendYield: dividend, volatility: vol, type: leg.type });
      return sum + leg.qty * result[metric];
    }, 0);
    const before = evaluate(baseSpot, baseVol, baseRate, "2025-01-02");
    const after = evaluate(scenario.spot, scenario.vol, scenario.rate, scenario.date);
    return { scenario, marketMove, book, metric: labels[metric], before, after, direction: greekDirection(before, after) };
  }, [ql, randomKey, bank]);
  const next = () => { setRandomKey(secureSeed()); setSeed((value) => value + 1); setAnswered(false); setFeedback(undefined); };
  const answer = (direction: GreekDirection) => {
    if (!question || answered) return;
    const correct = direction === question.direction;
    const nextStreak = correct ? scoreboard.streak + 1 : 0;
    const points = correct ? 100 + scoreboard.streak * 10 : -50;
    setAnswered(true); setFeedback(correct ? "correct" : "wrong");
    onScore(points, correct, nextStreak, `${question.metric} · ${question.book.name}`);
    setTimeout(next, REVIEW_DURATION_MS);
  };
  useEffect(() => {
    if (!question || answered) return;
    const timer = setTimeout(() => { setAnswered(true); setFeedback("timeout"); onScore(-50, false, 0, `${question.metric} · Time out`); setTimeout(next, REVIEW_DURATION_MS); }, duration);
    return () => clearTimeout(timer);
  }, [question, answered, duration, onScore]);
  return (
    <GameFrame
      mode="greekthon"
      eyebrow={`GREEKTHON · FLASH ROUND · STREAK ×${scoreboard.streak}`}
      title="Up, flat, or down?"
      intro="Read the market shock, the position, and the requested metric. No calculator. Just direction."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(1)}s`} durationMs={duration} resetKey={seed} />}
    >
      {question ? (
        <>
          <ScenarioCard
            label={`MARKET EVENT · ${question.metric}`}
            title={question.scenario.label}
            description={question.scenario.detail}
            metrics={[
              { label: "SPOT PRICE", value: <>{question.marketMove.beforeSpot.toFixed(2)} <b className={metricToneClass(question.marketMove.spotDirection)}>→ {question.marketMove.afterSpot.toFixed(2)}</b></> },
              { label: "IMPLIED VOLATILITY", value: <>{`${(question.marketMove.beforeVolatility * 100).toFixed(1)}%`} <b className={metricToneClass(question.marketMove.volatilityDirection)}>→ {(question.marketMove.afterVolatility * 100).toFixed(1)}%</b></> },
              { label: "INTEREST RATE", value: <>{`${(question.marketMove.beforeRate * 100).toFixed(2)}%`} <b className={metricToneClass(question.marketMove.rateDirection)}>→ {(question.marketMove.afterRate * 100).toFixed(2)}%</b></> },
            ]}
          />
          <div className="game-layout">
            <PositionBook
              label="YOUR POSITION"
              title={question.book.name}
              legs={question.book.legs.map((leg) => ({ side: leg.qty > 0 ? "long" : "short", text: `${Math.abs(leg.qty)}× ${leg.strike} ${leg.type.toUpperCase()}` }))}
            />
            <article className="game-panel">
              <h2>What happens to portfolio <strong>{question.metric}</strong>?</h2>
              <ChoiceGrid
                items={DIRECTIONS.map((direction) => ({ key: direction.key, label: direction.label, detail: direction.detail, tone: direction.tone }))}
                selected={[]}
                revealed={answered}
                answerIndex={DIRECTIONS.findIndex((direction) => direction.key === question.direction)}
                onToggle={(index) => answer(DIRECTIONS[index].key)}
                columns={3}
              />
            </article>
          </div>
          {answered && (
            <RevealBar
              cells={[
                { label: "RESULT", value: feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG", tone: feedback === "correct" ? "positive" : "negative" },
                { label: question.metric, value: <>{question.before.toFixed(4)} → <b className={metricToneClass(question.direction)}>{question.after.toFixed(4)}</b></> },
              ]}
              note={`${question.book.name} · ${question.scenario.label}: ${question.metric.toLowerCase()} goes ${question.direction === "up" ? "up" : question.direction === "down" ? "down" : "flat"}.`}
            />
          )}
        </>
      ) : (
        <div className="drop-zone">Preparing cards…</div>
      )}
    </GameFrame>
  );
}

export function Hedge({ ql, bank, onScore, onBack, scoreboard }: { ql?: QuantLibRuntime; bank: QuestionBank["hedge"]; onScore: (score: number, passed: boolean, label: string) => void; onBack: () => void; scoreboard: Scoreboard }) {
  const ROUND_SECONDS = 45;
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [result, setResult] = useState<{ passed: boolean; score: number; bestTradeIds: string[]; greeks: GreekRisk; timedOut: boolean }>();
  const [aiPrompt, setAiPrompt] = useState<string>();
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
      return { delta: book.delta + leg.qty * priced.delta, gamma: book.gamma + leg.qty * priced.gamma, vega: book.vega + leg.qty * priced.vega, theta: book.theta + leg.qty * priced.theta, rho: book.rho + leg.qty * priced.rho };
    }, { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 });
    const preTrade = { delta: -client.delta, gamma: -client.gamma, vega: -client.vega, theta: -client.theta, rho: -client.rho };
    const callStrike = Number((spot * 1.05).toFixed(2));
    const putStrike = Number((spot * .95).toFixed(2));
    const call = price({ type: "call", strike: callStrike, qty: 1 });
    const put = price({ type: "put", strike: putStrike, qty: 1 });
    const quantity = .5;
    const trades = [
      { id: "buy-stock", label: "BUY STOCK", detail: "Long Delta · neutral other Greeks", delta: quantity, gamma: 0, vega: 0, theta: 0, rho: 0 },
      { id: "sell-stock", label: "SELL STOCK", detail: "Short Delta · neutral other Greeks", delta: -quantity, gamma: 0, vega: 0, theta: 0, rho: 0 },
      { id: "buy-call", label: `BUY ${callStrike} CALL`, detail: "Long Delta · Gamma · Vega", delta: quantity * call.delta, gamma: quantity * call.gamma, vega: quantity * call.vega, theta: quantity * call.theta, rho: quantity * call.rho },
      { id: "sell-call", label: `SELL ${callStrike} CALL`, detail: "Short Delta · Gamma · Vega", delta: -quantity * call.delta, gamma: -quantity * call.gamma, vega: -quantity * call.vega, theta: -quantity * call.theta, rho: -quantity * call.rho },
      { id: "buy-put", label: `BUY ${putStrike} PUT`, detail: "Short Delta · Gamma · long Vega", delta: quantity * put.delta, gamma: quantity * put.gamma, vega: quantity * put.vega, theta: quantity * put.theta, rho: quantity * put.rho },
      { id: "sell-put", label: `SELL ${putStrike} PUT`, detail: "Long Delta · Gamma · short Vega", delta: -quantity * put.delta, gamma: -quantity * put.gamma, vega: -quantity * put.vega, theta: -quantity * put.theta, rho: -quantity * put.rho },
    ].map((trade) => ({
      ...trade,
      postDelta: preTrade.delta + trade.delta,
      postGamma: preTrade.gamma + trade.gamma,
      postVega: preTrade.vega + trade.vega,
      postTheta: preTrade.theta + trade.theta,
      postRho: preTrade.rho + trade.rho,
    }));
    const greekKeys: GreekKey[] = ["delta", "gamma", "vega", "theta", "rho"];
    const objectiveCount = 1 + Math.floor(rng() * 3);
    const objectiveKeys = greekKeys.sort(() => rng() - .5).slice(0, objectiveCount);
    const greekScale: Record<GreekKey, number> = { delta: .35, gamma: .04, vega: 18, theta: 2, rho: 20 };
    const risk = (greeks: GreekRisk) => Math.hypot(...objectiveKeys.map((key) => greeks[key] / greekScale[key]));
    const beforeRisk = risk(preTrade);
    const combinations = Array.from({ length: 1 << trades.length }, (_, mask) => trades.filter((_, index) => mask & (1 << index)));
    const bestTrades = combinations.sort((a, b) => risk(a.reduce((sum, trade) => addRisk(sum, trade), preTrade)) - risk(b.reduce((sum, trade) => addRisk(sum, trade), preTrade)))[0];
    const bestGreeks = bestTrades.reduce((sum, trade) => addRisk(sum, trade), preTrade);
    return { template, shock, maturityDate, beforeSpot, beforeVolatility, spot, volatility, legs, preTrade, trades, objectiveKeys, bestTrades, beforeRisk, bestRisk: risk(bestGreeks), risk };
  }, [ql, roundKey, bank]);
  const settle = (timedOut = false) => {
    if (!round || result || (!selectedTrades.length && !timedOut)) return;
    const selectedIds = selectedTrades.filter((id) => id !== "do-nothing");
    const selected = round.trades.filter((trade) => selectedIds.includes(trade.id));
    const greeks = selected.reduce((sum, trade) => addRisk(sum, trade), round.preTrade);
    const chosenRisk = round.risk(greeks);
    const availableImprovement = round.beforeRisk - round.bestRisk;
    const quality = availableImprovement <= .0001
      ? Number(selectedIds.length === round.bestTrades.length && selectedIds.every((id) => round.bestTrades.some((trade) => trade.id === id)))
      : Math.max(0, Math.min(1, (round.beforeRisk - chosenRisk) / availableImprovement));
    const passed = !timedOut && quality >= .8;
    const score = passed ? Math.round(100 + quality * 40 + secondsLeft * .4) : -50;
    setResult({ passed, score, bestTradeIds: round.bestTrades.map((trade) => trade.id), greeks, timedOut });
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
    setSelectedTrades([]);
    setSecondsLeft(ROUND_SECONDS);
    setResult(undefined);
  };
  if (!round) return <GameFrame mode="hedge" eyebrow="HEDGE" title="Read the shock. Pick the trade." onBack={onBack} scoreboard={scoreboard}><div className="drop-zone">Preparing hedge book…</div></GameFrame>;
  const deltaLabel = round.preTrade.delta >= 0 ? "LONG DELTA" : "SHORT DELTA";
  const gammaLabel = round.preTrade.gamma >= 0 ? "LONG GAMMA" : "SHORT GAMMA";
  const vegaLabel = round.preTrade.vega >= 0 ? "LONG VEGA" : "SHORT VEGA";
  const bestTrades = round.trades.filter((trade) => result?.bestTradeIds.includes(trade.id));
  const bestHedgeLabel = bestTrades.length ? bestTrades.map((trade) => trade.label).join(" + ") : "DO NOTHING";
  const objectiveLabel = round.objectiveKeys.map((key) => greekLabels[key]).join(" + ");
  const createHedgePrompt = () => {
    const availableTools = [...round.trades.map((trade) => `${trade.label}: ${trade.detail}`), "DO NOTHING: keep the current book unchanged"].join("\n");
    const selectedLabel = selectedTrades.length ? selectedTrades.map((id) => id === "do-nothing" ? "DO NOTHING" : round.trades.find((trade) => trade.id === id)?.label ?? id).join(" + ") : "No hedge selected";
    setAiPrompt(["You are a derivatives risk tutor. Explain this failed portfolio-hedging exercise at the player's level. Teach the risk logic clearly, including why the selected hedge was weaker and how to choose a better hedge.", `PLAYER LEVEL: ${scoreboard.difficulty.toUpperCase()} (adapt the explanation and terminology to this level)`, `Market event: ${round.shock.label}`, `Market detail: ${round.shock.detail}`, `Spot: ${round.beforeSpot.toFixed(2)} -> ${round.spot.toFixed(2)}`, `Volatility: ${(round.beforeVolatility * 100).toFixed(1)}% -> ${(round.volatility * 100).toFixed(1)}%`, `Maturity: ${round.maturityDate}`, `Dealer objective: ${objectiveLabel}`, `Client product: ${round.template.name}`, `Product description: ${round.template.description}`, `Product option legs: ${round.legs.map((leg) => `${leg.qty > 0 ? "LONG" : "SHORT"} ${leg.strike} ${leg.type.toUpperCase()}`).join("; ")}`, "Available hedge tools:", availableTools, `My selected hedge: ${selectedLabel}`, `Resulting Greeks: Delta ${result?.greeks.delta.toFixed(3) ?? "n/a"}, Gamma ${result?.greeks.gamma.toFixed(3) ?? "n/a"}, Vega ${result?.greeks.vega.toFixed(2) ?? "n/a"}, Theta ${result?.greeks.theta.toFixed(2) ?? "n/a"}, Rho ${result?.greeks.rho.toFixed(2) ?? "n/a"}`, "Please explain the dealer's objective, identify the key mistake, and give a level-appropriate decision rule for future decisions."] .join("\n"));
  };
  const choiceItems: { key: string; label: string; detail: string; wide?: boolean }[] = [
    ...round.trades.map((trade) => ({ key: trade.id, label: trade.label, detail: trade.detail })),
    { key: "do-nothing", label: "DO NOTHING", detail: "Keep the current book unchanged", wide: true },
  ];
  const selectedIndices = choiceItems.map((item, index) => selectedTrades.includes(item.key) ? index : -1).filter((index) => index >= 0);
  const toggleTrade = (index: number) => {
    if (result) return;
    const id = choiceItems[index].key;
    setSelectedTrades((current) => {
      if (id === "do-nothing") return current.includes("do-nothing") ? [] : ["do-nothing"];
      const without = current.filter((existing) => existing !== "do-nothing");
      return without.includes(id) ? without.filter((existing) => existing !== id) : [...without, id];
    });
  };
  return (
    <GameFrame
      mode="hedge"
      eyebrow="HEDGE · MARKET INTUITION"
      title="Read the shock. Pick the trade."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="MARKET CLOSE" value={`${secondsLeft}s`} progress={secondsLeft / ROUND_SECONDS * 100} urgent={secondsLeft <= 10} />}
    >
      <ScenarioCard
        label="MARKET EVENT · BEFORE → AFTER"
        title={round.shock.label}
        description={<>{round.shock.detail} The dealer's goal is to neutralize the book's risk, not to predict the market.</>}
        metrics={[
          { label: "SPOT PRICE", value: <>{round.beforeSpot.toFixed(2)} <b>→ {round.spot.toFixed(2)}</b></> },
          { label: "IMPLIED VOLATILITY", value: <>{`${(round.beforeVolatility * 100).toFixed(1)}%`} <b>→ {(round.volatility * 100).toFixed(1)}%</b></> },
          { label: "MATURITY", value: round.maturityDate },
        ]}
      >
        <div className="dealer-objective">
          <small>DEALER OBJECTIVE</small>
          <strong>{objectiveLabel}</strong>
          <span>Reduce this exposure{round.objectiveKeys.length > 1 ? " set" : ""} while avoiding unnecessary risk in the rest of the book.</span>
        </div>
      </ScenarioCard>
      <div className="game-layout">
        <PositionBook
          label="CLIENT PRODUCT · DEALER SHORT"
          title={round.template.name}
          description={round.template.description}
          legs={round.legs.map((leg) => ({ side: leg.qty > 0 ? "long" : "short", text: `${leg.strike} ${leg.type.toUpperCase()}` }))}
          signals={<>
            <small>DEALER RISK AFTER SHOCK</small>
            <strong className={round.preTrade.delta >= 0 ? "positive" : "negative"}>{deltaLabel}</strong>
            <strong className={round.preTrade.gamma >= 0 ? "positive" : "negative"}>{gammaLabel}</strong>
            <strong className={round.preTrade.vega >= 0 ? "positive" : "negative"}>{vegaLabel}</strong>
          </>}
        />
        <article className="game-panel">
          <h2>Build the hedge</h2>
          <ChoiceGrid
            note="Select multiple instruments when one Greek needs more than one offset."
            items={choiceItems}
            selected={selectedIndices}
            revealed={Boolean(result)}
            onToggle={toggleTrade}
          />
        </article>
      </div>
      {result && (
        <RevealBar
          cells={[
            { label: "BEFORE", value: greekLines(round.preTrade) },
            { label: "AFTER YOUR HEDGE", value: greekLines(result.greeks) },
          ]}
          note={result.passed ? "Good call. The dealer's objective is met: the combined book risk is reduced." : result.timedOut ? `Best hedge: ${bestHedgeLabel}.` : `The selected hedge leaves more combined Greek risk. Best hedge: ${bestHedgeLabel}.`}
        />
      )}
      {result ? (
        <><RoundResult passed={result.passed} status={result.passed ? "RISK REDUCED" : result.timedOut ? "MARKET CLOSED" : "RISK NOT IMPROVED"} score={result.score} actionLabel="NEXT SHOCK" onNext={next} onAskAI={createHedgePrompt} />{aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}</>
      ) : (
        <div className="action-row submit-only"><button className="primary-action game-primary" disabled={!selectedTrades.length} onClick={() => settle(false)}>COMMIT HEDGE <span>→</span></button></div>
      )}
    </GameFrame>
  );
}
