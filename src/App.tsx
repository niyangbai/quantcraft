import { useEffect, useState } from "react";
import { getQuantLib } from "./quantlib";
import { Payoff } from "./games/payoff";
import { OrderBook } from "./games/order-book";
import { Greek } from "./games/greek";
import { Hedge } from "./games/hedge";
import { MakeMarket } from "./games/make-market";
import { Volatility } from "./games/volatility";
import { Curve } from "./games/curve";
import { Exotic } from "./games/exotic";
import { AppShell, GameOverScreen, Collection, Landing, Onboarding } from "./ui";

import { difficultyLives, emptyScoreboard, exampleQuestionBank, GAME_LABELS, parseQuestionBank, totalScore } from "./game";
import type {
  Difficulty,
  DrillMode,
  Mode,
  PlayerProfile,
  QuestionBank,
  RuntimeState,
  Scoreboard,
} from "./game";
const nowLabel = (): string => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
      const parsed = JSON.parse(saved) as Partial<Scoreboard> & { greekthon?: Scoreboard["greek"] };
      const rawDifficulty = parsed.difficulty ?? emptyScoreboard.difficulty;
      const difficulty = rawDifficulty in difficultyLives ? rawDifficulty : emptyScoreboard.difficulty;
      const defaultLives = difficultyLives[difficulty] ?? 0;
      return {
        ...emptyScoreboard,
        ...parsed,
        difficulty,
        maxLives: typeof parsed.maxLives === "number" ? parsed.maxLives : defaultLives,
        lives: typeof parsed.lives === "number" ? parsed.lives : defaultLives,
        streak: typeof parsed.streak === "number" ? parsed.streak : 0,
        gameOver: parsed.gameOver === true,
        payoff: { ...emptyScoreboard.payoff, ...parsed.payoff },
        greek: { ...emptyScoreboard.greek, ...(parsed.greek ?? parsed.greekthon) }, // legacy scoreboards used the "greekthon" key
        orderbook: { ...emptyScoreboard.orderbook, ...parsed.orderbook },
        hedge: { ...emptyScoreboard.hedge, ...parsed.hedge },
        makemarket: { ...emptyScoreboard.makemarket, ...parsed.makemarket },
        volatility: { ...emptyScoreboard.volatility, ...parsed.volatility },
        curve: { ...emptyScoreboard.curve, ...parsed.curve },
        exotic: { ...emptyScoreboard.exotic, ...parsed.exotic },
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
  const recordDrill = (mode: DrillMode) => (score: number, correct: boolean, streak: number, label: string) =>
    setScoreboard((current) => {
      const stat = current[mode];
      const next: Scoreboard = {
        ...current,
        ...nextRunState(current, correct),
        recent: [{ game: GAME_LABELS[mode], label, score, at: nowLabel() }, ...current.recent].slice(0, 8),
      };
      next[mode] = { score: stat.score + score, answers: stat.answers + 1, correct: stat.correct + Number(correct), bestStreak: Math.max(stat.bestStreak, streak) };
      return next;
    });
  const recordPayoff = recordDrill("payoff");
  const recordGreek = recordDrill("greek");
  const recordOrderBook = recordDrill("orderbook");
  const recordMakeMarket = recordDrill("makemarket");
  const recordVolatility = recordDrill("volatility");
  const recordCurve = recordDrill("curve");
  const recordExotic = recordDrill("exotic");
  const recordHedge = (score: number, passed: boolean, label: string) => setScoreboard((current) => ({
    ...current,
    ...nextRunState(current, passed),
    hedge: { score: current.hedge.score + score, rounds: current.hedge.rounds + 1, passed: current.hedge.passed + Number(passed), best: Math.max(current.hedge.best, score) },
    recent: [{ game: "Hedge" as const, label, score, at: nowLabel() }, ...current.recent].slice(0, 8),
  }));
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
    <AppShell
      runtime={runtime}
      profileName={profile?.name}
      transitionKey={mode}
      onHome={() => setMode("landing")}
      onCollection={() => setMode("collection")}
    >
      {mode === "landing" && <Landing scoreboard={scoreboard} bank={questionBank} onInstallBank={installQuestionBank} onDifficulty={selectDifficulty} onSelect={setMode} />}
      {mode === "payoff" && !showGameOver && (
        <Payoff ql={runtime.ql} seeds={questionBank.payoff} onScore={recordPayoff} onBack={() => setMode("landing")} scoreboard={scoreboard} />
      )}
      {mode === "greek" && !showGameOver && <Greek ql={runtime.ql} bank={questionBank.greek} onScore={recordGreek} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
      {mode === "orderbook" && !showGameOver && <OrderBook seeds={questionBank.orderbook} onScore={recordOrderBook} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
      {mode === "hedge" && !showGameOver && <Hedge ql={runtime.ql} bank={questionBank.hedge} onScore={recordHedge} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
      {mode === "makemarket" && !showGameOver && <MakeMarket ql={runtime.ql} params={questionBank.makemarket} onScore={recordMakeMarket} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
      {mode === "volatility" && !showGameOver && <Volatility ql={runtime.ql} params={questionBank.volatility} onScore={recordVolatility} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
      {mode === "curve" && !showGameOver && <Curve ql={runtime.ql} params={questionBank.curve} onScore={recordCurve} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
      {mode === "exotic" && !showGameOver && <Exotic ql={runtime.ql} params={questionBank.exotic} onScore={recordExotic} onBack={() => setMode("landing")} scoreboard={scoreboard} />}
      {mode === "collection" && <Collection name={profile?.name ?? "Player"} scoreboard={scoreboard} onRename={renamePlayer} onResetScore={newRun} onBack={() => setMode("landing")} />}
      {showGameOver && mode !== "landing" && mode !== "collection" && <GameOverScreen difficulty={scoreboard.difficulty} totalScore={totalScore(scoreboard)} onCollection={() => setMode("collection")} onNewRun={newRun} />}
      {!profile && <Onboarding onFinish={finishOnboarding} />}
    </AppShell>
  );
}

export default App;
