import { useEffect, useMemo, useState } from "react";
import { AiPromptModal, GameScoreboard, RoundResult, RoundTimer } from "./Controls";
import { secureSeed, seededRandom } from "./game";
import type { Scoreboard } from "./game";
import { buildPayoffPrompt, decisionDurationMs, generatePayoffQuestion, legDetailText, legSideText, levelForProgress, levelLabel } from "./payoffGame";
import type { PayoffSeed, PayoffTier } from "./payoffGame";
import "./Hedge.css";
import "./Payoff.css";

export function Payoff({
  seeds,
  onScore,
  onBack,
  scoreboard,
}: {
  seeds: PayoffSeed[];
  onScore: (score: number, correct: boolean, streak: number, label: string) => void;
  onBack: () => void;
  scoreboard: Scoreboard;
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
    return generatePayoffQuestion(rng, seeds, roundLevel);
  }, [roundKey, seeds, roundLevel]);

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
    return <section className="mode-view game-page payoff"><button className="back-home" onClick={onBack}><span aria-hidden="true">←</span> BACK TO HOME</button><GameScoreboard scoreboard={scoreboard} mode="payoff" /><div className="drop-zone">No payoff position seeds loaded.</div></section>;
  }

  return (
    <section className="mode-view game-page payoff">
      <button className="back-home" onClick={onBack}><span aria-hidden="true">←</span> BACK TO HOME</button>
      <GameScoreboard scoreboard={scoreboard} mode="payoff" />
      <div className="mode-header payoff-head">
        <div>
          <p className="eyebrow">PAYOFF · FLASH DRILL · ROUND {round} · {levelLabel(roundLevel)}</p>
          <h1>Call the payoff.</h1>
        </div>
        <div className="header-tools">
          <RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} />
        </div>
      </div>
      {question ? <>
        <section className="hedge-market market-shock payoff-scenario">
          <small>SCENARIO · {question.typeLabel}</small>
          <strong>{question.questionText}</strong>
          <p>{question.scenarioText}</p>
          <div className="shock-metrics">
            <span>
              <small>TERMINAL SPOT S(T)</small>
              <strong>{question.type === "payoff" ? question.spot : "?"}</strong>
            </span>
            <span>
              <small>POSITION</small>
              <strong>{question.bookSummary}</strong>
            </span>
            <span>
              <small>LEVEL</small>
              <strong>{question.levelLabel}</strong>
            </span>
          </div>
        </section>
        <div className="hedge-layout">
          <article className="hedge-product position-book payoff-book">
            <small>YOUR POSITION</small>
            <h2>{question.seed.label}</h2>
            <div className="hedge-legs">
              {question.legs.map((leg, index) => (
                <div key={`${leg.kind}-${index}`}>
                  <b className={leg.side}>{legSideText(leg)}</b>
                  <span>{legDetailText(leg)}</span>
                </div>
              ))}
            </div>
            <div className="risk-signals">
              <small>BOOK PAYOFF</small>
              <strong className="payoff-rule">Σ quantity × signed leg payoff</strong>
            </div>
          </article>
          <article className="hedge-ticket">
            <h2>{question.typeLabel}</h2>
            <p className="hedge-choice-note">{question.questionText}</p>
            <div className="trade-choices payoff-choices">
              {question.choices.map((choice, index) => {
                const isCorrect = index === question.answerIndex;
                const isSelected = index === selectedIndex;
                const className = answered ? (isCorrect ? "correct" : isSelected ? "wrong" : "") : "";
                return (
                  <button key={index} className={className} disabled={answered} onClick={() => submit(index)}>
                    <strong>{choice.label}</strong>
                    <small>{choice.hint}</small>
                  </button>
                );
              })}
            </div>
          </article>
        </div>
        {answered && (
          <div className="hedge-reveal payoff-reveal">
            <div>
              <span>RESULT</span>
              <strong className={feedback === "correct" ? "positive" : "negative"}>
                {feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG"}
              </strong>
            </div>
            <div>
              <span>ANSWER</span>
              <strong>{question.answerText}</strong>
            </div>
            <p>{question.explanation}</p>
          </div>
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
      </> : <div className="drop-zone">Preparing payoff cards…</div>}
    </section>
  );
}
