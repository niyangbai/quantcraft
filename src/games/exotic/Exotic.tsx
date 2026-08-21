import "./exotic.css";
import { useEffect, useMemo, useState } from "react";
import { AiPromptModal, ChoiceGrid, GameFrame, RevealBar, RoundResult, RoundTimer, ScenarioCard, SideBadge } from "../../ui";
import { secureSeed, seededRandom } from "../../game";
import type { Scoreboard } from "../../game";
import type { QuantLibRuntime } from "@quantcraft/quantlibjs";
import { buildExoticPrompt, exoticDurationMs, generateExoticRound, positionBody, positionDetail } from "./game";
import type { ExoticParams } from "./game";

export function Exotic({
  ql,
  params,
  onScore,
  onBack,
  scoreboard,
}: {
  ql?: QuantLibRuntime;
  params: ExoticParams;
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

  const duration = exoticDurationMs(scoreboard.streak);
  const question = useMemo(() => {
    if (!ql) return undefined;
    const rng = seededRandom(roundKey);
    return generateExoticRound(rng, ql, params);
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

  const loser = question ? question.pnl[question.answerIndex] : undefined;
  const statusText = feedback === "correct"
    ? "PAIN SPOTTED"
    : feedback === "timeout"
      ? "DECISION WINDOW CLOSED"
      : scoreboard.difficulty === "intern" ? "WRONG POSITION" : "WRONG POSITION · −1 LIFE";

  return (
    <GameFrame
      mode="exotic"
      eyebrow={`EXOTIC · FLASH DRILL · ROUND ${round}`}
      title="Find the state that matters. Find the pain."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} paused={answered} />}
    >
      {question && loser ? (
        <>
          <ScenarioCard
            label="MARKET SHOCK"
            title={question.questionText}
            description={question.scenarioText}
            largeTitle
            metrics={[
              { label: "SHOCK", value: question.shockLabel },
              { label: "SPOT", value: `${question.baseSpot} → ${question.afterSpot}`, tone: question.afterSpot < question.baseSpot ? "negative" : "positive" },
              { label: "VOL", value: `${(question.baseVol * 100).toFixed(0)}% → ${(question.afterVol * 100).toFixed(0)}%`, tone: question.afterVol < question.baseVol ? "negative" : "positive" },
            ]}
          />
          <article className="exotic-board">
            <h2>YOUR READ</h2>
            <p className="choice-note">Read the shock into each payoff's state: the barrier, the digital strike, the running average, the weakest asset. Then call the biggest loser.</p>
            <ChoiceGrid
              columns={2}
              items={question.positions.map((position) => ({
                key: position.id,
                label: <><SideBadge side={position.side} />{positionBody(position.spec)}</>,
                detail: positionDetail(position.spec),
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
                { label: "LOSER", value: question.answerText },
                { label: "PRICE", value: `${loser.priceBefore.toFixed(2)} → ${loser.priceAfter.toFixed(2)}` },
                { label: "SHOCK", value: question.shockLabel },
                { label: "P&L", value: `${loser.pnl >= 0 ? "+" : ""}${loser.pnl.toFixed(2)}`, tone: loser.pnl >= 0 ? "positive" : "negative" },
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
              onAskAI={feedback === "correct" ? undefined : () => setAiPrompt(buildExoticPrompt(question, scoreboard.difficulty))}
            />
          )}
          {aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}
        </>
      ) : (
        <div className="drop-zone">{ql ? "Building the exotic book…" : "Loading the QuantLib engine…"}</div>
      )}
    </GameFrame>
  );
}
