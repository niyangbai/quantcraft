import "./volatility.css";
import { useEffect, useMemo, useState } from "react";
import { AiPromptModal, ChoiceGrid, GameFrame, RevealBar, RoundResult, RoundTimer, ScenarioCard, SideBadge, VolSurface3D } from "../../ui";
import { difficultyTimeScale, roundScore, seededRandom } from "../../game";
import { useSeededRound } from "../../hooks";
import type { Scoreboard } from "../../game";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { buildVolatilityPrompt, generateVolatilityRound, positionBody, positionDetail, volatilityDurationMs } from "./game";
import type { VolatilityParams } from "./game";

export function Volatility({
  ql,
  params,
  onScore,
  onBack,
  scoreboard,
}: {
  ql?: QuantLibRuntime;
  params: VolatilityParams;
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

  const duration = volatilityDurationMs(scoreboard.streak) * difficultyTimeScale(scoreboard.difficulty);
  const question = useMemo(() => {
    if (!ql) return undefined;
    const rng = seededRandom(roundKey);
    return generateVolatilityRound(rng, ql, params);
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
    onScore(points, correct, nextStreak, `${question.answerText} · ${question.shockLabel}`);
  };

  useEffect(() => {
    if (!question || answered) return;
    const timer = window.setTimeout(() => {
      setAnswered(true);
      setFeedback("timeout");
      setSelectedIndex(undefined);
      setLastScore(-50);
      onScore(-50, false, 0, `${question.answerText} · ${question.shockLabel} · Time out`);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [question, answered, duration, onScore]);

  const winner = question ? question.analysis[question.answerIndex] : undefined;
  const statusText = feedback === "correct"
    ? "VOL P&L SPOTTED"
    : feedback === "timeout"
      ? "DECISION WINDOW CLOSED"
      : scoreboard.difficulty === "intern" ? "WRONG POSITION" : "WRONG POSITION · −1 LIFE";

  return (
    <GameFrame
      mode="volatility"
      eyebrow={`VOLATILITY · ROUND ${round}`}
      title="Read the surface. Find the vol P&L."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} paused={answered} />}
    >
      {question && winner ? (
        <>
          <ScenarioCard
            label="SURFACE SHOCK"
            title={question.questionText}
            description={question.scenarioText}
            largeTitle
            metrics={[
              { label: "SPOT", value: question.spot.toFixed(0) },
              { label: "BASE SURFACE", value: `ATM ${(question.surface.atmLevel * 100).toFixed(0)}% · SKEW ${question.surface.skew.toFixed(2)}` },
              { label: "SHOCK", value: question.shockLabel },
            ]}
          />
          <VolSurface3D base={question.surface} shocked={question.shockedSurface} />
          <article className="vol-board">
            <h2>YOUR READ</h2>
            <p className="choice-note">Read the shock across expiry, then account for side and size.</p>
            <ChoiceGrid
              columns={3}
              items={question.positions.map((position) => ({
                key: position.id,
                label: <><SideBadge side={position.side} />{positionBody(position)}</>,
                detail: positionDetail(position),
              }))}
              selected={selectedIndex !== undefined ? [selectedIndex] : []}
              revealed={answered}
              answerIndex={question.answerIndex}
              onToggle={(index) => submit(index)}
            />
          </article>
          {answered && (
            <RevealBar
              cells={[
                { label: "RESULT", value: feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG", tone: feedback === "correct" ? "positive" : "negative" },
                { label: "WINNER", value: question.answerText },
                { label: "ΔIV", value: `${winner.deltaIVPoints >= 0 ? "+" : ""}${winner.deltaIVPoints.toFixed(1)} pts`, tone: winner.deltaIVPoints >= 0 ? "positive" : "negative" },
                { label: "VEGA", value: `${winner.vegaPerPoint.toFixed(3)}/pt` },
                { label: "IV", value: `${(winner.ivBefore * 100).toFixed(1)}% → ${(winner.ivAfter * 100).toFixed(1)}%` },
                { label: "VOL P&L", value: `${winner.pnl >= 0 ? "+" : ""}${winner.pnl.toFixed(2)}`, tone: winner.pnl >= 0 ? "positive" : "negative" },
              ]}
              note={question.explanation}
            />
          )}
          {answered && (
            <RoundResult
              passed={feedback === "correct"}
              status={statusText}
              score={lastScore}
              actionLabel="NEXT ROUND"
              onNext={next}
              onAskAI={feedback === "correct" ? undefined : () => setAiPrompt(buildVolatilityPrompt(question, scoreboard.difficulty))}
            />
          )}
          {aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}
        </>
      ) : (
        <div className="drop-zone">{ql ? "Building the surface…" : "Loading the QuantLib engine…"}</div>
      )}
    </GameFrame>
  );
}
