import "./hedge.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { GREEK_LABELS } from "@quantcraft/finmath";
import type { GreekKey, GreekRisk } from "@quantcraft/finmath";
import { AiPromptModal, ChoiceGrid, GameFrame, PositionBook, RevealBar, RoundResult, RoundTimer, ScenarioCard, SideBadge } from "../../ui";
import { difficultyTimeScale, seededRandom, tutorIntro } from "../../game";
import { useSeededRound } from "../../hooks";
import type { QuestionBank, Scoreboard } from "../../game";
import { generateHedgeRound, settleHedge, tradeBody } from "./game";
import type { HedgeSettlement } from "./game";
import { HedgeChart } from "./HedgeChart";

const GREEK_SYMBOLS: Record<GreekKey, string> = { delta: "Δ", gamma: "Γ", vega: "V", theta: "Θ", rho: "ρ" };
const GREEK_PRECISION: Record<GreekKey, number> = { delta: 3, gamma: 3, vega: 2, theta: 2, rho: 2 };

const greekLines = (greeks: GreekRisk, keys: GreekKey[]) => (
  <>
    {keys.map((key) => (
      <span key={key}>{GREEK_SYMBOLS[key]} {greeks[key].toFixed(GREEK_PRECISION[key])}</span>
    ))}
  </>
);

export function Hedge({ ql, bank, onScore, onBack, scoreboard }: { ql?: QuantLibRuntime; bank: QuestionBank["hedge"]; onScore: (score: number, passed: boolean, label: string) => void; onBack: () => void; scoreboard: Scoreboard }) {
  const ROUND_SECONDS = 45 * difficultyTimeScale(scoreboard.difficulty);
  const { roundKey, nextSeed } = useSeededRound();
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
    nextSeed();
    setSelectedTrades([]);
    setSecondsLeft(ROUND_SECONDS);
    setResult(undefined);
  };
  if (!round) return <GameFrame mode="hedge" eyebrow="HEDGE" title="Read the shock. Pick the trade." onBack={onBack} scoreboard={scoreboard}><div className="drop-zone">Preparing hedge book…</div></GameFrame>;
  const bestTrades = round.trades.filter((trade) => result?.bestTradeIds.includes(trade.id));
  const bestHedgeLabel = bestTrades.length ? bestTrades.map((trade) => trade.label).join(" + ") : "DO NOTHING";
  const objectiveLabel = round.objectiveKeys.map((key) => GREEK_LABELS[key]).join(" + ");
  const createHedgePrompt = () => {
    const availableTools = [...round.trades.map((trade) => `${trade.label}: ${trade.detail}`), "DO NOTHING: keep the current book unchanged"].join("\n");
    const selectedLabel = selectedTrades.length ? selectedTrades.map((id) => id === "do-nothing" ? "DO NOTHING" : round.trades.find((trade) => trade.id === id)?.label ?? id).join(" + ") : "No hedge selected";
    setAiPrompt([tutorIntro(scoreboard.difficulty), `Market event: ${round.shock.label}`, `Market detail: ${round.shock.detail}`, `Spot: ${round.beforeSpot.toFixed(2)} -> ${round.spot.toFixed(2)}`, `Volatility: ${(round.beforeVolatility * 100).toFixed(1)}% -> ${(round.volatility * 100).toFixed(1)}%`, `Maturity: ${round.maturityDate}`, `Dealer objective: ${objectiveLabel}`, `Client product: ${round.template.name}`, `Product description: ${round.template.description}`, `Product option legs: ${round.legs.map((leg) => `${leg.qty > 0 ? "LONG" : "SHORT"} ${leg.strike} ${leg.type.toUpperCase()}`).join("; ")}`, "Available hedge tools:", availableTools, `My selected hedge: ${selectedLabel}`, `Resulting Greeks: Delta ${result?.greeks.delta.toFixed(3) ?? "n/a"}, Gamma ${result?.greeks.gamma.toFixed(3) ?? "n/a"}, Vega ${result?.greeks.vega.toFixed(2) ?? "n/a"}, Theta ${result?.greeks.theta.toFixed(2) ?? "n/a"}, Rho ${result?.greeks.rho.toFixed(2) ?? "n/a"}`, "Explain the dealer's objective, identify the key mistake, and give one short, memorable decision rule for future trades."].join("\n"));
  };
  const choiceItems: { key: string; label: ReactNode; detail?: string; wide?: boolean }[] = [
    ...round.trades.map((trade) => ({ key: trade.id, label: <><SideBadge side={trade.side} />{tradeBody(trade)}</> })),
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
        <div className="position-stack">
          <PositionBook
            label="CLIENT POSITION"
            title={round.template.name}
            description={round.template.description}
            legs={round.legs.map((leg) => ({ side: leg.qty > 0 ? "long" : "short", text: `${leg.strike} ${leg.type.toUpperCase()}` }))}
          />
          <PositionBook
            label="DEALER POSITION"
            legs={round.legs.map((leg) => ({ side: leg.qty > 0 ? "short" : "long", text: `${leg.strike} ${leg.type.toUpperCase()}` }))}
          />
        </div>
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
            { label: "BEFORE", value: greekLines(round.preTrade, round.objectiveKeys) },
            { label: "YOUR HEDGE", value: greekLines(result.greeks, round.objectiveKeys) },
            { label: "CORRECT HEDGE", value: greekLines(result.bestGreeks, round.objectiveKeys) },
          ]}
          note={result.passed ? "Good call. The dealer's objective is met: the combined book risk is reduced." : result.timedOut ? `Best hedge: ${bestHedgeLabel}.` : `The selected hedge leaves more combined Greek risk. Best hedge: ${bestHedgeLabel}.`}
        />
      )}
      {result && <HedgeChart before={round.preTrade} user={result.greeks} best={result.bestGreeks} objectiveKeys={round.objectiveKeys} />}
      {result ? (
        <><RoundResult passed={result.passed} status={result.passed ? "RISK REDUCED" : result.timedOut ? "MARKET CLOSED" : "RISK NOT IMPROVED"} score={result.score} actionLabel="NEXT SHOCK" onNext={next} onAskAI={createHedgePrompt} />{aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}</>
      ) : (
        <div className="action-row submit-only"><button className="primary-action game-primary" disabled={!selectedTrades.length} onClick={() => settle(false)}>COMMIT HEDGE <span>→</span></button></div>
      )}
    </GameFrame>
  );
}

