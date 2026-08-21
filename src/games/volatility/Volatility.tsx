import { useEffect, useMemo, useState } from "react";
import { AiPromptModal, ChoiceGrid, GameFrame, RevealBar, RoundResult, RoundTimer, ScenarioCard } from "../../ui";
import { secureSeed, seededRandom } from "../../game";
import type { Scoreboard } from "../../game";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { buildVolatilityPrompt, generateVolatilityRound, positionDetail, positionLabel, volatilityDurationMs } from "./game";
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
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [round, setRound] = useState(1);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [lastScore, setLastScore] = useState(0);
  const [aiPrompt, setAiPrompt] = useState<string>();

  const duration = volatilityDurationMs(scoreboard.streak);
  const question = useMemo(() => {
    if (!ql) return undefined;
    const rng = seededRandom(roundKey);
    return generateVolatilityRound(rng, ql, params);
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
      eyebrow={`VOLATILITY · FLASH DRILL · ROUND ${round}`}
      title="Read the surface. Find the vol P&L."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} />}
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
          <div className="game-layout">
            <article className="game-panel">
              <h2>YOUR READ</h2>
              <p className="choice-note">Vol P&L ≈ qty × vega (per 1 vol point) × ΔIV. Read the shock, weigh ΔIV against vega and side, then call the biggest positive one.</p>
              <ChoiceGrid
                columns={3}
                items={question.positions.map((position) => ({
                  key: position.id,
                  label: positionLabel(position),
                  detail: positionDetail(position),
                }))}
                selected={selectedIndex !== undefined ? [selectedIndex] : []}
                revealed={answered}
                answerIndex={question.answerIndex}
                onToggle={(index) => submit(index)}
              />
            </article>
          </div>
          {answered && (
            <RevealBar
              cells={[
                { label: "RESULT", value: feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG", tone: feedback === "correct" ? "positive" : "negative" },
                { label: "WINNER", value: question.answerText },
                { label: "VOL P&L", value: `${winner.pnl >= 0 ? "+" : ""}${winner.pnl.toFixed(2)}`, tone: winner.pnl >= 0 ? "positive" : "negative" },
                { label: "VEGA", value: `${winner.vegaPerPoint.toFixed(3)}/pt` },
                { label: "ΔIV", value: `${winner.deltaIVPoints >= 0 ? "+" : ""}${winner.deltaIVPoints.toFixed(1)} pts`, tone: winner.deltaIVPoints >= 0 ? "positive" : "negative" },
                { label: "IV", value: `${(winner.ivBefore * 100).toFixed(1)}% → ${(winner.ivAfter * 100).toFixed(1)}%` },
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
