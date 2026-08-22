import { useEffect, useRef, useState } from "react";
import { totalScore } from "../game";
import type { DrillMode, Scoreboard } from "../game";

export type GameMode = DrillMode | "hedge";

/** A small LONG/SHORT pill, reused across every drill's option cards. */
export function SideBadge({ side }: { side: "long" | "short" }) {
  return <span className={`side-badge ${side}`}>{side === "long" ? "LONG" : "SHORT"}</span>;
}

export function RoundResult({ passed, status, score, actionLabel, onNext, onAskAI }: { passed: boolean; status: string; score: number; actionLabel: string; onNext: () => void; onAskAI?: () => void }) {
  return (
    <div className={`round-result ${passed ? "passed" : "failed"}`}>
      <div><small>{status}</small><strong>{score >= 0 ? "+" : ""}{score} PTS</strong></div>
      <div className="round-result-actions">{!passed && onAskAI && <button onClick={onAskAI}>ASK AI <span aria-hidden="true">↗</span></button>}<button onClick={onNext}>{actionLabel} <span aria-hidden="true">→</span></button></div>
    </div>
  );
}

export function AiPromptModal({ prompt, onClose }: { prompt: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
  };
  return <div className="ai-prompt-backdrop" role="dialog" aria-modal="true" aria-labelledby="ai-prompt-title" onClick={onClose}><section className="ai-prompt-modal" onClick={(event) => event.stopPropagation()}><div className="ai-prompt-head"><div><p className="panel-label">LEARNING REVIEW</p><h2 id="ai-prompt-title">Ask an AI tutor</h2></div><button type="button" onClick={onClose} aria-label="Close AI prompt">×</button></div><p className="ai-prompt-intro">Copy this context into your preferred AI tool for a level-aware explanation.</p><textarea readOnly value={prompt} aria-label="AI tutor prompt" /><div className="ai-prompt-actions"><button type="button" onClick={copyPrompt}>{copied ? "COPIED" : "COPY PROMPT"}</button><button type="button" className="ai-prompt-close" onClick={onClose}>CLOSE</button></div></section></div>;
}

export function GameScoreboard({ scoreboard, mode }: { scoreboard: Scoreboard; mode: GameMode }) {
  const [feedback, setFeedback] = useState<"success" | "failure" | "life">();
  const modeStats = mode === "hedge"
    ? { score: scoreboard.hedge.score, rounds: scoreboard.hedge.rounds, successes: scoreboard.hedge.passed }
    : { score: scoreboard[mode].score, rounds: scoreboard[mode].answers, successes: scoreboard[mode].correct };
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
      <span>TOTAL SCORE<strong>{totalScore(scoreboard)}</strong></span>
      <span>MODE SCORE<strong>{modeStats.score}</strong></span>
      <span>STREAK<strong>×{scoreboard.streak}</strong></span>
      <span className="scoreboard-lives">LIVES<strong>{lives}</strong></span>
      {feedback === "success" && <div className="score-feedback success-signal" role="status" aria-live="polite"><div><i aria-hidden="true" /><b>CORRECT</b></div></div>}
      {feedback === "life" && <div className="score-feedback success-signal" role="status" aria-live="polite"><div><i aria-hidden="true" /><b>+1 LIFE</b></div></div>}
      {feedback === "failure" && <div className="score-feedback failure-signal" role="status" aria-live="polite"><div><i aria-hidden="true" /><b>{infiniteLives ? "MISS" : "−1 LIFE"}</b></div></div>}
    </div>
  );
}

function CountdownValue({ durationMs, paused }: { durationMs: number; paused: boolean }) {
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const interval = window.setInterval(() => {
      setRemainingMs(Math.max(0, durationMs - (performance.now() - start)));
    }, 100);
    return () => window.clearInterval(interval);
  }, [durationMs, paused]);

  return <>{Math.ceil(remainingMs / 1000)}s</>;
}

export function RoundTimer({
  label,
  value,
  progress,
  urgent = false,
  durationMs,
  resetKey,
  paused = false,
}: {
  label: string;
  value?: string;
  progress?: number;
  urgent?: boolean;
  durationMs?: number;
  resetKey?: number;
  paused?: boolean;
}) {
  return (
    <div className={`round-timer ${urgent ? "urgent" : ""}`}>
      <small>{label}</small>
      <strong>{durationMs !== undefined ? <CountdownValue key={resetKey} durationMs={durationMs} paused={paused} /> : value}</strong>
      <div key={resetKey}>
        <i
          className={`${durationMs ? "animated" : ""}${paused ? " paused" : ""}`}
          style={durationMs
            ? { animationDuration: `${durationMs}ms` }
            : { width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }}
        />
      </div>
    </div>
  );
}
