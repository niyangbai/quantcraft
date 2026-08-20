import { useEffect, useRef, useState } from "react";
import type { Scoreboard } from "./game";

type GameMode = "craft" | "greekthon" | "hedge";

export function RoundResult({ passed, status, score, actionLabel, onNext }: { passed: boolean; status: string; score: number; actionLabel: string; onNext: () => void }) {
  return (
    <div className={`round-result ${passed ? "passed" : "failed"}`}>
      <div><small>{status}</small><strong>{score >= 0 ? "+" : ""}{score} PTS</strong></div>
      <button onClick={onNext}>{actionLabel} <span aria-hidden="true">→</span></button>
    </div>
  );
}

export function GameScoreboard({ scoreboard, mode }: { scoreboard: Scoreboard; mode: GameMode }) {
  const [feedback, setFeedback] = useState<"success" | "failure" | "life">();
  const totalScore = scoreboard.craft.score + scoreboard.greekthon.score + scoreboard.hedge.score;
  const modeStats = mode === "craft"
    ? { score: scoreboard.craft.score, rounds: scoreboard.craft.rounds, successes: scoreboard.craft.wins }
    : mode === "greekthon"
      ? { score: scoreboard.greekthon.score, rounds: scoreboard.greekthon.answers, successes: scoreboard.greekthon.correct }
      : { score: scoreboard.hedge.score, rounds: scoreboard.hedge.rounds, successes: scoreboard.hedge.passed };
  const previous = useRef({ rounds: modeStats.rounds, successes: modeStats.successes, lives: scoreboard.lives });
  const infiniteLives = scoreboard.difficulty === "intern";
  const lives = infiniteLives
    ? "INFINITE"
    : `${"♥".repeat(scoreboard.lives)}${"♡".repeat(scoreboard.maxLives - scoreboard.lives)}`;

  useEffect(() => {
    const last = previous.current;
    if (modeStats.rounds > last.rounds) {
      const succeeded = modeStats.successes > last.successes;
      setFeedback(succeeded && scoreboard.lives > last.lives ? "life" : succeeded ? "success" : "failure");
      const timer = window.setTimeout(() => setFeedback(undefined), 650);
      previous.current = { rounds: modeStats.rounds, successes: modeStats.successes, lives: scoreboard.lives };
      return () => window.clearTimeout(timer);
    }
    previous.current = { rounds: modeStats.rounds, successes: modeStats.successes, lives: scoreboard.lives };
  }, [modeStats.rounds, modeStats.successes, scoreboard.lives]);

  return (
    <div className={`game-scoreboard ${feedback ?? ""}`} aria-label="Current run scoreboard">
      <span>TOTAL SCORE<strong>{totalScore}</strong></span>
      <span>MODE SCORE<strong>{modeStats.score}</strong></span>
      <span>STREAK<strong>×{scoreboard.streak}</strong></span>
      <span className="scoreboard-lives">LIVES<strong>{lives}</strong></span>
      {feedback === "success" && <div className="score-feedback success-signal" role="status" aria-live="polite"><div><i aria-hidden="true" /><b>CORRECT</b></div></div>}
      {feedback === "life" && <div className="score-feedback success-signal" role="status" aria-live="polite"><div><i aria-hidden="true" /><b>+1 LIFE</b></div></div>}
      {feedback === "failure" && <div className="score-feedback failure-signal" role="status" aria-live="polite"><div><i aria-hidden="true" /><b>{infiniteLives ? "MISS" : "−1 LIFE"}</b></div></div>}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "slider-row disabled" : "slider-row"}>
      <span>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        disabled={disabled}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function RoundTimer({
  label,
  value,
  progress,
  urgent = false,
  durationMs,
  resetKey,
}: {
  label: string;
  value: string;
  progress?: number;
  urgent?: boolean;
  durationMs?: number;
  resetKey?: number;
}) {
  return (
    <div className={`round-timer ${urgent ? "urgent" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <div key={resetKey}>
        <i
          className={durationMs ? "animated" : ""}
          style={durationMs
            ? { animationDuration: `${durationMs}ms` }
            : { width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }}
        />
      </div>
    </div>
  );
}
