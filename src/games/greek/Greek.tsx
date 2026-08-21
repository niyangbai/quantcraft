import "./greek.css";
import { useEffect, useMemo, useState } from "react";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { AiPromptModal, ChoiceGrid, GameFrame, PositionBook, RevealBar, RoundResult, RoundTimer, ScenarioCard } from "../../ui";
import { secureSeed, seededRandom } from "../../game";
import type { QuestionBank, Scoreboard } from "../../game";
import { buildGreekPrompt, generateGreekQuestion, greekDurationMs } from "./game";
import type { GreekDirection } from "./game";

const metricToneClass = (direction: GreekDirection): string =>
  direction === "up" ? "tone-positive" : direction === "down" ? "tone-negative" : "tone-flat";

const DIRECTIONS: { key: GreekDirection; label: string; detail: string; tone: "down" | "flat" | "up" }[] = [
  { key: "down", label: "↓", detail: "GOES DOWN", tone: "down" },
  { key: "unchanged", label: "→", detail: "UNCHANGED", tone: "flat" },
  { key: "up", label: "↑", detail: "GOES UP", tone: "up" },
];

export function Greek({ ql, bank, onScore, onBack, scoreboard }: { ql?: QuantLibRuntime; bank: QuestionBank["greek"]; onScore: (score: number, correct: boolean, streak: number, label: string) => void; onBack: () => void; scoreboard: Scoreboard }) {
  const [seed, setSeed] = useState(0);
  const [randomKey, setRandomKey] = useState(secureSeed);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const [lastScore, setLastScore] = useState(0);
  const [aiPrompt, setAiPrompt] = useState<string>();
  const duration = greekDurationMs(scoreboard.streak);
  const question = useMemo(() => (ql ? generateGreekQuestion(seededRandom(randomKey), ql, bank) : undefined), [ql, randomKey, bank]);
  const next = () => { setRandomKey(secureSeed()); setSeed((value) => value + 1); setAnswered(false); setFeedback(undefined); setLastScore(0); setAiPrompt(undefined); };
  const answer = (direction: GreekDirection) => {
    if (!question || answered) return;
    const correct = direction === question.direction;
    const nextStreak = correct ? scoreboard.streak + 1 : 0;
    const points = correct ? 100 + scoreboard.streak * 10 : -50;
    setAnswered(true); setFeedback(correct ? "correct" : "wrong"); setLastScore(points);
    onScore(points, correct, nextStreak, `${question.metric} · ${question.book.name}`);
  };
  useEffect(() => {
    if (!question || answered) return;
    const timer = setTimeout(() => { setAnswered(true); setFeedback("timeout"); setLastScore(-50); onScore(-50, false, 0, `${question.metric} · Time out`); }, duration);
    return () => clearTimeout(timer);
  }, [question, answered, duration, onScore]);
  return (
    <GameFrame
      mode="greek"
      eyebrow={`GREEK · FLASH ROUND · STREAK ×${scoreboard.streak}`}
      title="Up, flat, or down?"
      intro="Read the market shock, the position, and the requested metric. No calculator. Just direction."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={seed} paused={answered} />}
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
          {answered && (
            <RoundResult
              passed={feedback === "correct"}
              status={feedback === "correct"
                ? "GREEK CALLED"
                : feedback === "timeout"
                  ? "DECISION WINDOW CLOSED"
                  : scoreboard.difficulty === "intern" ? "WRONG DIRECTION" : "WRONG DIRECTION · −1 LIFE"}
              score={lastScore}
              actionLabel="NEXT ROUND"
              onNext={next}
              onAskAI={feedback === "correct" ? undefined : () => setAiPrompt(buildGreekPrompt(question, scoreboard.difficulty))}
            />
          )}
          {aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}
        </>
      ) : (
        <div className="drop-zone">Preparing cards…</div>
      )}
    </GameFrame>
  );
}
