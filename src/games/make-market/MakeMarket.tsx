import "./make-market.css";
import { useEffect, useMemo, useState } from "react";
import { AiPromptModal, ChoiceGrid, GameFrame, RevealBar, RoundResult, RoundTimer, ScenarioCard } from "../../ui";
import { secureSeed, seededRandom } from "../../game";
import type { Scoreboard } from "../../game";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { buildMakeMarketPrompt, generateMakeMarketRound, inventoryText, makeMarketDurationMs } from "./game";
import type { MakeMarketParams } from "./game";

const quoteTone = (value: number): "positive" | "negative" | undefined => (value === 0 ? undefined : value > 0 ? "positive" : "negative");

export function MakeMarket({
  ql,
  params,
  onScore,
  onBack,
  scoreboard,
}: {
  ql: QuantLibRuntime | undefined;
  params: MakeMarketParams;
  onScore: (score: number, correct: boolean, streak: number, label: string) => void;
  onBack: () => void;
  scoreboard: Scoreboard;
}) {
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [round, setRound] = useState(1);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [lastScore, setLastScore] = useState(0);
  const [aiPrompt, setAiPrompt] = useState<string>();

  const duration = makeMarketDurationMs(scoreboard.streak);
  const question = useMemo(() => {
    const rng = seededRandom(roundKey);
    return generateMakeMarketRound(rng, ql, params);
  }, [roundKey, ql, params]);

  const next = () => {
    setRoundKey(secureSeed());
    setRound((value) => value + 1);
    setAnswered(false);
    setFeedback(undefined);
    setSelectedIndex(undefined);
    setAiPrompt(undefined);
  };

  const submit = (index: number) => {
    if (!question || answered) return;
    const correct = index === question.answerIndex;
    const nextStreak = correct ? scoreboard.streak + 1 : 0;
    const points = correct ? 100 + scoreboard.streak * 10 : -50;
    setAnswered(true);
    setFeedback(correct ? "correct" : "wrong");
    setSelectedIndex(index);
    setLastScore(points);
    onScore(points, correct, nextStreak, `${question.answerText} · ${inventoryText(question.inventory)}`);
  };

  useEffect(() => {
    if (!question || answered) return;
    const timer = window.setTimeout(() => {
      setAnswered(true);
      setFeedback("timeout");
      setSelectedIndex(undefined);
      setLastScore(-50);
      onScore(-50, false, 0, `${question.answerText} · ${inventoryText(question.inventory)} · Time out`);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [question, answered, duration, onScore]);

  const analysis = question?.analysis;

  return (
    <GameFrame
      mode="makemarket"
      eyebrow={`MAKE MARKET · FLASH DRILL · ROUND ${round}`}
      title="Make the market."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} />}
    >
      {question && analysis ? (
        <>
          <ScenarioCard
            label="MARKET"
            title={question.questionText}
            description={question.scenarioText}
            largeTitle
            metrics={[
              { label: "FAIR VALUE", value: question.fairValue.toFixed(2) },
              { label: "INVENTORY", value: inventoryText(question.inventory), tone: quoteTone(question.inventory) },
              { label: "UNCERTAINTY", value: question.uncertainty.toFixed(2) },
            ]}
          />
          <div className="game-layout">
            <article className="game-panel">
              <h2>YOUR QUOTE</h2>
              <p className="choice-note">The synthetic model scores every quote on fill probability, spread capture, adverse selection, and inventory risk.</p>
              <ChoiceGrid
                note={question.questionText}
                items={question.choices.map((choice, index) => ({ key: `${choice.label}-${index}`, label: choice.label, detail: choice.detail }))}
                selected={selectedIndex !== undefined ? [selectedIndex] : []}
                revealed={answered}
                answerIndex={question.answerIndex}
                onToggle={(index) => submit(index)}
                large
              />
            </article>
          </div>
          {answered && (
            <RevealBar
              cells={[
                { label: "RESULT", value: feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG", tone: feedback === "correct" ? "positive" : "negative" },
                { label: "BEST QUOTE", value: question.answerText },
                { label: "EXPECTED UTILITY", value: `${analysis.utility >= 0 ? "+" : ""}${analysis.utility.toFixed(4)}`, tone: analysis.utility >= 0 ? "positive" : "negative" },
                { label: "FILL", value: `${(analysis.fillProbability * 100).toFixed(1)}%` },
                { label: "EDGE", value: `+${analysis.expectedEdge.toFixed(4)}` },
                { label: "ADVERSE", value: `−${analysis.adverseSelection.toFixed(4)}`, tone: "negative" },
                { label: "INVENTORY", value: `${analysis.inventoryPenalty >= 0 ? "−" : "+"}${Math.abs(analysis.inventoryPenalty).toFixed(4)}`, tone: analysis.inventoryPenalty <= 0 ? "positive" : "negative" },
              ]}
              note={question.explanation}
            />
          )}
          {answered && (
            <RoundResult
              passed={feedback === "correct"}
              status={feedback === "correct"
                ? "QUOTE SPOTTED"
                : feedback === "timeout"
                  ? "DECISION WINDOW CLOSED"
                  : scoreboard.difficulty === "intern" ? "WRONG QUOTE" : "WRONG QUOTE · −1 LIFE"}
              score={lastScore}
              actionLabel="NEXT ROUND"
              onNext={next}
              onAskAI={feedback === "correct" ? undefined : () => setAiPrompt(buildMakeMarketPrompt(question, scoreboard.difficulty))}
            />
          )}
          {aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}
        </>
      ) : (
        <div className="drop-zone">Preparing the market…</div>
      )}
    </GameFrame>
  );
}

