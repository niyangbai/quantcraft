import "./make-market.css";
import { useEffect, useMemo, useState } from "react";
import { AiPromptModal, GameFrame, RoundResult, RoundTimer, ScenarioCard } from "../../ui";
import { difficultyTimeScale, roundScore, seededRandom } from "../../game";
import { useSeededRound } from "../../hooks";
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
  const { roundKey, nextSeed } = useSeededRound();
  const [round, setRound] = useState(1);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [lastScore, setLastScore] = useState(0);
  const [aiPrompt, setAiPrompt] = useState<string>();

  const duration = makeMarketDurationMs(scoreboard.streak) * difficultyTimeScale(scoreboard.difficulty);
  const question = useMemo(() => {
    const rng = seededRandom(roundKey);
    return generateMakeMarketRound(rng, ql, params);
  }, [roundKey, ql, params]);

  const next = () => {
    nextSeed();
    setRound((value) => value + 1);
    setAnswered(false);
    setFeedback(undefined);
    setSelectedIndex(undefined);
    setAiPrompt(undefined);
  };

  const submit = (index: number) => {
    if (!question || answered) return;
    const correct = index === question.answerIndex;
    const { points, nextStreak } = roundScore(scoreboard.streak, correct);
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

  return (
    <GameFrame
      mode="makemarket"
      eyebrow={`MAKE MARKET · ROUND ${round}`}
      title="Make the market."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} paused={answered} />}
    >
      {question ? (
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
          <article className="quote-board">
            <h2>YOUR QUOTE</h2>
            <p className="choice-note">The synthetic model scores every quote on fill probability, spread capture, adverse selection, and inventory risk.</p>
            <div className="quote-grid">
              {question.choices.map((choice, index) => {
                const isSelected = selectedIndex === index;
                const isCorrect = answered && index === question.answerIndex;
                const isWrong = answered && index !== question.answerIndex && isSelected;
                const className = answered ? (isCorrect ? "correct" : isWrong ? "wrong" : "") : isSelected ? "selected" : "";
                return (
                  <button key={`${choice.label}-${index}`} className={className} disabled={answered} onClick={() => submit(index)}>
                    <span className="quote-side bid"><small>BID</small><strong>{choice.quote.bid.toFixed(2)}</strong></span>
                    <span className="quote-side ask"><small>ASK</small><strong>{choice.quote.ask.toFixed(2)}</strong></span>
                    <span className="quote-meta">{choice.detail}</span>
                  </button>
                );
              })}
            </div>
          </article>
          {answered && (
            <section className="analysis-board">
              <div className="analysis-group">
                <p className="analysis-group-label">OUTCOME</p>
                <div className="analysis-grid cols-2">
                  <div className="analysis-cell">
                    <span>RESULT</span>
                    <strong className={feedback === "correct" ? "tone-positive" : "tone-negative"}>{feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG"}</strong>
                  </div>
                  <div className="analysis-cell">
                    <span>BEST QUOTE</span>
                    <strong>{question.answerText}</strong>
                  </div>
                </div>
              </div>
              <p className="analysis-note">{question.explanation}</p>
            </section>
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

