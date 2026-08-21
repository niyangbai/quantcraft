import { useEffect, useMemo, useRef, useState } from "react";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { GREEK_LABELS } from "@quantcraft/finmath";
import type { GreekRisk } from "@quantcraft/finmath";
import { AiPromptModal, ChoiceGrid, GameFrame, PositionBook, RevealBar, RoundResult, RoundTimer, ScenarioCard } from "../../ui";
import { secureSeed, seededRandom } from "../../game";
import type { QuestionBank, Scoreboard } from "../../game";
import { generateHedgeRound, settleHedge } from "./game";
import type { HedgeSettlement } from "./game";

const greekLines = (greeks: GreekRisk) => (
  <>
    <span>Δ {greeks.delta.toFixed(3)}</span>
    <span>Γ {greeks.gamma.toFixed(3)}</span>
    <span>V {greeks.vega.toFixed(2)}</span>
    <span>Θ {greeks.theta.toFixed(2)}</span>
    <span>ρ {greeks.rho.toFixed(2)}</span>
  </>
);

export function Hedge({ ql, bank, onScore, onBack, scoreboard }: { ql?: QuantLibRuntime; bank: QuestionBank["hedge"]; onScore: (score: number, passed: boolean, label: string) => void; onBack: () => void; scoreboard: Scoreboard }) {
  const ROUND_SECONDS = 45;
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [result, setResult] = useState<HedgeSettlement>();
  const [aiPrompt, setAiPrompt] = useState<string>();
  const settleRef = useRef<(timedOut?: boolean) => void>(() => undefined);
  const round = useMemo(() => (ql ? generateHedgeRound(seededRandom(roundKey), ql, bank) : undefined), [ql, roundKey, bank]);
  const settle = (timedOut = false) => {
    if (!round || result || (!selectedTrades.length && !timedOut)) return;
    const settlement = settleHedge(round, selectedTrades, secondsLeft, timedOut);
    setResult(settlement);
    onScore(settlement.score, settlement.passed, `${round.template.name} · ${round.shock.label}`);
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
  const objectiveLabel = round.objectiveKeys.map((key) => GREEK_LABELS[key]).join(" + ");
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

