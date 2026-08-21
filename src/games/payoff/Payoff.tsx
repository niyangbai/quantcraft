import "./payoff.css";
import { useEffect, useMemo, useState } from "react";
import { AiPromptModal, RoundResult, RoundTimer } from "../../ui";
import { secureSeed, seededRandom } from "../../game";
import type { Scoreboard } from "../../game";
import { buildPayoffPrompt, decisionDurationMs, generatePayoffQuestion, legDetailText, levelForProgress, levelLabel } from "./game";
import type { PayoffSeed, PayoffTier } from "./game";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { ChoiceGrid, GameFrame, PositionBook, RevealBar, ScenarioCard } from "../../ui";

export function Payoff({
  seeds,
  onScore,
  onBack,
  scoreboard,
  ql,
}: {
  seeds: PayoffSeed[];
  onScore: (score: number, correct: boolean, streak: number, label: string) => void;
  onBack: () => void;
  scoreboard: Scoreboard;
  ql?: QuantLibRuntime;
}) {
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [round, setRound] = useState(1);
  const [correctCount, setCorrectCount] = useState(0);
  const [roundLevel, setRoundLevel] = useState<PayoffTier>(1);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [lastScore, setLastScore] = useState(0);
  const [aiPrompt, setAiPrompt] = useState<string>();

  const level = levelForProgress(correctCount);
  const duration = decisionDurationMs(roundLevel, scoreboard.streak);
  const question = useMemo(() => {
    const rng = seededRandom(roundKey);
    return generatePayoffQuestion(rng, seeds, roundLevel, ql);
  }, [roundKey, seeds, roundLevel, ql]);

  const next = () => {
    setRoundKey(secureSeed());
    setRound((value) => value + 1);
    setRoundLevel(level);
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
    if (correct) setCorrectCount((value) => value + 1);
    onScore(points, correct, nextStreak, `${question.typeLabel} · ${question.seed.label}`);
  };

  useEffect(() => {
    if (!question || answered) return;
    const timer = window.setTimeout(() => {
      setAnswered(true);
      setFeedback("timeout");
      setSelectedIndex(undefined);
      setLastScore(-50);
      onScore(-50, false, 0, `${question.typeLabel} · ${question.seed.label} · Time out`);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [question, answered, duration, onScore]);

  if (!seeds.length) {
    return <GameFrame mode="payoff" eyebrow="PAYOFF" title="Call the payoff." onBack={onBack} scoreboard={scoreboard}><div className="drop-zone">No payoff position seeds loaded.</div></GameFrame>;
  }

  return (
    <GameFrame
      mode="payoff"
      eyebrow={`PAYOFF · FLASH DRILL · ROUND ${round} · ${levelLabel(roundLevel)}`}
      title="Call the payoff."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} />}
    >
      {question ? (
        <>
          <ScenarioCard
            label={`SCENARIO · ${question.typeLabel}`}
            title={question.questionText}
            description={question.scenarioText}
            largeTitle
            metrics={[
              { label: "TERMINAL SPOT S(T)", value: question.type === "payoff" ? question.spot : "?" },
              { label: "POSITION", value: question.bookSummary },
              { label: "LEVEL", value: question.levelLabel },
            ]}
          />
          <div className="game-layout">
            <PositionBook
              label="YOUR POSITION"
              title={question.seed.label}
              legs={question.legs.map((leg) => ({ side: leg.side, text: legDetailText(leg) }))}
              signals={<><small>BOOK PAYOFF</small><strong className="signal-rule">Σ quantity × signed leg payoff</strong></>}
            />
            <article className="game-panel">
              <h2>{question.typeLabel}</h2>
              <ChoiceGrid
                note={question.questionText}
                items={question.choices.map((choice, index) => ({ key: `${choice.label}-${index}`, label: choice.label, detail: choice.hint }))}
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
                { label: "ANSWER", value: question.answerText },
              ]}
              note={question.explanation}
            />
          )}
          {answered && (
            <RoundResult
              passed={feedback === "correct"}
              status={feedback === "correct"
                ? "PAYOFF SPOTTED"
                : feedback === "timeout"
                  ? "DECISION WINDOW CLOSED"
                  : scoreboard.difficulty === "intern" ? "WRONG PAYOFF" : "WRONG PAYOFF · −1 LIFE"}
              score={lastScore}
              actionLabel="NEXT ROUND"
              onNext={next}
              onAskAI={feedback === "correct" ? undefined : () => setAiPrompt(buildPayoffPrompt(question, scoreboard.difficulty))}
            />
          )}
          {aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}
        </>
      ) : (
        <div className="drop-zone">Preparing payoff cards…</div>
      )}
    </GameFrame>
  );
}
