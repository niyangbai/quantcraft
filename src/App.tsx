import { useEffect, useState } from "react";
import { getQuantLib } from "./quantlib";
import { Craft } from "./Craft";
import { Greekthon, Hedge } from "./RiskGames";
import { Collection, Landing, Onboarding } from "./Shell";
import "./Core.css";

import { difficultyLives, emptyScoreboard, exampleQuestionBank, parseQuestionBank } from "./game";
import type {
  Difficulty,
  Mode,
  PlayerProfile,
  QuestionBank,
  RuntimeState,
  Scoreboard,
} from "./game";
function useQuantLib(): RuntimeState {
  const [state, setState] = useState<RuntimeState>({ status: "loading" });
  useEffect(() => {
    getQuantLib()
      .then((ql) => setState({ status: "ready", ql }))
      .catch((error) => setState({ status: "error", error: String(error) }));
  }, []);
  return state;
}

function App() {
  const runtime = useQuantLib();
  const [mode, setMode] = useState<Mode>("landing");
  const [profile, setProfile] = useState<PlayerProfile | undefined>(() => {
    try {
      const saved = localStorage.getItem("quantcraft.profile");
      if (!saved) return undefined;
      const parsed = JSON.parse(saved) as PlayerProfile;
      return parsed.name && parsed.storage === true ? parsed : undefined;
    } catch { return undefined; }
  });
  const [scoreboard, setScoreboard] = useState<Scoreboard>(() => {
    try {
      if (!profile?.storage) return emptyScoreboard;
      const saved = localStorage.getItem("quantcraft.scoreboard");
      if (!saved) return emptyScoreboard;
      const parsed = JSON.parse(saved) as Partial<Scoreboard>;
      const difficulty = parsed.difficulty ?? emptyScoreboard.difficulty;
      const defaultLives = difficultyLives[difficulty] ?? 0;
      return {
        ...emptyScoreboard,
        ...parsed,
        difficulty,
        maxLives: typeof parsed.maxLives === "number" ? parsed.maxLives : defaultLives,
        lives: typeof parsed.lives === "number" ? parsed.lives : defaultLives,
        streak: typeof parsed.streak === "number" ? parsed.streak : 0,
        gameOver: parsed.gameOver === true,
        craft: { ...emptyScoreboard.craft, ...parsed.craft },
        greekthon: { ...emptyScoreboard.greekthon, ...parsed.greekthon },
        hedge: { ...emptyScoreboard.hedge, ...parsed.hedge },
        recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      };
    } catch { return emptyScoreboard; }
  });
  const [showGameOver, setShowGameOver] = useState(scoreboard.gameOver);
  const [questionBank, setQuestionBank] = useState<QuestionBank>(() => {
    try {
      if (!profile?.storage) return exampleQuestionBank;
      const saved = localStorage.getItem("quantcraft.questionBank");
      return saved ? parseQuestionBank(JSON.parse(saved)) : exampleQuestionBank;
    } catch {
      return exampleQuestionBank;
    }
  });
  const installQuestionBank = (bank: QuestionBank) => {
    if (profile?.storage) localStorage.setItem("quantcraft.questionBank", JSON.stringify(bank));
    setQuestionBank(bank);
  };
  useEffect(() => {
    if (profile?.storage) localStorage.setItem("quantcraft.scoreboard", JSON.stringify(scoreboard));
  }, [scoreboard, profile]);
  useEffect(() => {
    if (!scoreboard.gameOver) return;
    const timer = window.setTimeout(() => setShowGameOver(true), 650);
    return () => window.clearTimeout(timer);
  }, [scoreboard.gameOver]);
  const finishOnboarding = (name: string, storage: boolean) => {
    const next = { name: name.trim(), storage };
    if (storage) localStorage.setItem("quantcraft.profile", JSON.stringify(next));
    setProfile(next);
  };
  const renamePlayer = (name: string) => setProfile((current) => {
    if (!current) return current;
    const next = { ...current, name: name.trim() };
    if (next.storage) localStorage.setItem("quantcraft.profile", JSON.stringify(next));
    return next;
  });
  const nextRunState = (current: Scoreboard, passed: boolean) => {
    if (!passed) {
      const lives = current.difficulty === "intern" ? current.lives : Math.max(0, current.lives - 1);
      return { streak: 0, lives, gameOver: current.difficulty === "intern" ? false : lives === 0 };
    }
    const streak = current.streak + 1;
    const earnsLife = current.difficulty !== "intern" && streak % 3 === 0 && current.lives < current.maxLives;
    return { streak, lives: current.lives + Number(earnsLife), gameOver: false };
  };
  const recordCraft = (score: number, passed: boolean, label: string) => setScoreboard((current) => ({
    ...current,
    ...nextRunState(current, passed),
    craft: { score: current.craft.score + score, rounds: current.craft.rounds + 1, wins: current.craft.wins + Number(passed), best: Math.max(current.craft.best, score) },
    recent: [{ game: "Craft" as const, label, score, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current.recent].slice(0, 8),
  }));
  const recordGreekthon = (score: number, correct: boolean, streak: number, label: string) => setScoreboard((current) => ({
    ...current,
    ...nextRunState(current, correct),
    greekthon: { score: current.greekthon.score + score, answers: current.greekthon.answers + 1, correct: current.greekthon.correct + Number(correct), bestStreak: Math.max(current.greekthon.bestStreak, streak) },
    recent: [{ game: "Greekthon" as const, label, score, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current.recent].slice(0, 8),
  }));
  const recordHedge = (score: number, passed: boolean, label: string) => setScoreboard((current) => ({
    ...current,
    ...nextRunState(current, passed),
    hedge: { score: current.hedge.score + score, rounds: current.hedge.rounds + 1, passed: current.hedge.passed + Number(passed), best: Math.max(current.hedge.best, score) },
    recent: [{ game: "Hedge" as const, label, score, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current.recent].slice(0, 8),
  }));
  const totalScore = scoreboard.craft.score + scoreboard.greekthon.score + scoreboard.hedge.score;
  const newRun = () => {
    setShowGameOver(false);
    setScoreboard((current) => ({ ...emptyScoreboard, difficulty: current.difficulty, maxLives: current.maxLives, lives: current.maxLives, recent: [] }));
  };
  const selectDifficulty = (difficulty: Difficulty) => {
    if (scoreboard.difficulty === difficulty) return;
    const lives = difficultyLives[difficulty] ?? 0;
    setShowGameOver(false);
    setScoreboard({ ...emptyScoreboard, difficulty, maxLives: lives, lives, recent: [] });
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-mark brand-button" onClick={() => setMode("landing")} aria-label="Back to home"><span className="brand-dot" />QUANT<span>CRAFT</span></button>
        <div className="topbar-status">
          <span className={`status-pulse ${runtime.status}`} />
          {runtime.status === "ready"
            ? <><span>Internal pricing engine: </span><a className="engine-link" href="https://github.com/lballabio/QuantLib" target="_blank" rel="noreferrer">QuantLib</a></>
            : runtime.status === "loading"
              ? "Preparing internal pricing engine…"
              : "Internal pricing engine unavailable"}
        </div>
        <a
          className="repo-link"
          href="https://github.com/niyangbai/quantcraft"
          target="_blank"
          rel="noreferrer"
          aria-label="Open the QuantCraft GitHub repository"
          title="GitHub repository"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.93 10.93 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
          </svg>
        </a>
        <button
          className="avatar avatar-button"
          onClick={() => setMode("collection")}
          aria-label="Open collection"
          title="Collection"
        >
          {profile ? profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() : "?"}
        </button>
      </header>
      {runtime.status === "error" && (
        <div className="runtime-error">
          QuantLib failed to load: {runtime.error}
        </div>
      )}
      <main className="main-content">
        <div className="page-transition" key={mode}>
          {mode === "landing" && <Landing scoreboard={scoreboard} bank={questionBank} onInstallBank={installQuestionBank} onDifficulty={selectDifficulty} onSelect={setMode} />}
          {mode === "craft" && !showGameOver && (
            <Craft ql={runtime.ql} missions={questionBank.craft} onScore={recordCraft} onBack={() => setMode("landing")} scoreboard={scoreboard} />
          )}
          {mode === "greekthon" && !showGameOver && <Greekthon ql={runtime.ql} bank={questionBank.greekthon} onScore={recordGreekthon} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
          {mode === "hedge" && !showGameOver && <Hedge ql={runtime.ql} bank={questionBank.hedge} onScore={recordHedge} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
          {mode === "collection" && <Collection name={profile?.name ?? "Player"} scoreboard={scoreboard} onRename={renamePlayer} onResetScore={newRun} onBack={() => setMode("landing")} />}
          {showGameOver && mode !== "landing" && mode !== "collection" && <section className="game-over"><span>RUN OVER · {scoreboard.difficulty.toUpperCase()}</span><h1>No lives left.</h1><strong>{totalScore} PTS</strong><div><button onClick={() => setMode("collection")}>VIEW SETTLEMENT</button><button onClick={newRun}>NEW RUN</button></div></section>}
        </div>
      </main>
      <footer className="site-footer">
        <div>
          <div className="footer-brand"><span className="brand-dot" aria-hidden="true" /><strong>QUANT<span>CRAFT</span></strong></div>
          <p>For educational and entertainment purposes only. Nothing in this game is financial, investment, trading, legal, or tax advice. Prices and model outputs are illustrative.</p>
          <nav aria-label="Footer links"><a href="https://github.com/niyangbai/quantcraft/blob/master/LICENSE" target="_blank" rel="noreferrer">LICENSE</a></nav>
        </div>
      </footer>
      {!profile && <Onboarding onFinish={finishOnboarding} />}
    </div>
  );
}

export default App;
