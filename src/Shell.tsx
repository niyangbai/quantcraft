import { useState } from "react";
import { exampleQuestionBank, parseQuestionBank } from "./game";
import type { Difficulty, Mode, QuestionBank, Scoreboard } from "./game";
import "./QuestionBank.css";
import "./Settlement.css";
import "./Landing.css";

export function Onboarding({ onFinish }: { onFinish: (name: string, storage: boolean) => void }) {
  const [name, setName] = useState("");
  const ready = name.trim().length > 0;
  return <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><section className="onboarding-card"><span className="onboarding-mark">QC</span><p className="eyebrow">WELCOME TO QUANTCRAFT</p><h1 id="welcome-title">What should we call you?</h1><label className="name-field"><span>PLAYER NAME</span><input autoFocus maxLength={30} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" onKeyDown={(event) => { if (event.key === "Enter" && ready) onFinish(name, true); }} /></label><div className="privacy-note"><strong>COOKIE & STORAGE NOTICE</strong><p>QuantCraft uses no advertising or tracking cookies. With your permission, browser Local Storage keeps your name, score, lives, and uploaded question bank on this device.</p></div><div className="onboarding-actions"><button disabled={!ready} onClick={() => onFinish(name, true)}>SAVE & PLAY</button><button disabled={!ready} onClick={() => onFinish(name, false)}>PLAY THIS SESSION ONLY</button></div><small>You can play without storage; refreshing the page will reset your progress.</small></section></div>;
}

function QuestionBankPanel({ bank, onInstallBank }: { bank: QuestionBank; onInstallBank: (bank: QuestionBank) => void }) {
  const [bankMessage, setBankMessage] = useState<{ ok: boolean; text: string }>();
  const downloadExample = () => {
    const blob = new Blob([JSON.stringify(exampleQuestionBank, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "quantcraft-question-bank.example.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const uploadBank = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseQuestionBank(JSON.parse(await file.text()));
      onInstallBank(parsed);
      setBankMessage({ ok: true, text: `Loaded ${parsed.craft.length} Craft questions, ${parsed.greekthon.scenarios.length} scenarios, ${parsed.greekthon.books.length} Greekthon books, and ${parsed.hedge.products.length} Hedge products.` });
    } catch (error) {
      setBankMessage({ ok: false, text: error instanceof Error ? error.message : "Invalid question bank" });
    } finally {
      event.target.value = "";
    }
  };
  return <section className="question-bank-panel"><div><p className="panel-label">SHARED QUESTION BANK</p><h2>One JSON. Three games.</h2><p>Craft missions, Greekthon flashcards, and Hedge products use the same validated file. The installed bank is saved in this browser.</p><div className="bank-counts"><span><strong>{bank.craft.length}</strong> Craft</span><span><strong>{bank.greekthon.scenarios.length}</strong> Scenarios</span><span><strong>{bank.greekthon.books.length}</strong> Greek books</span><span><strong>{bank.greekthon.metrics.length}</strong> KPIs</span><span><strong>{bank.hedge.products.length}</strong> Hedge products</span></div></div><div className="bank-actions"><button onClick={downloadExample}>DOWNLOAD EXAMPLE JSON</button><label>UPLOAD QUESTION BANK<input type="file" accept="application/json,.json" onChange={uploadBank} /></label></div>{bankMessage && <div className={bankMessage.ok ? "bank-message ok" : "bank-message error"}>{bankMessage.text}</div>}</section>;
}

export function Landing({ scoreboard, bank, onInstallBank, onDifficulty, onSelect }: { scoreboard: Scoreboard; bank: QuestionBank; onInstallBank: (bank: QuestionBank) => void; onDifficulty: (difficulty: Difficulty) => void; onSelect: (mode: Mode) => void }) {
  const total = scoreboard.craft.score + scoreboard.greekthon.score + scoreboard.hedge.score;
  return <section className="landing"><div className="landing-hero"><p className="eyebrow">QUANTCRAFT · QUANTLIB WASM</p><h1>Build risk.<br />Read risk.</h1><p>Choose a difficulty, then a mode. All three games share one score and one life pool.</p><div className="landing-run"><span>{scoreboard.difficulty === "intern" ? "INFINITE LIFE" : <>{"♥".repeat(scoreboard.lives)}{"♡".repeat(scoreboard.maxLives - scoreboard.lives)}</>}</span><strong>{total} PTS</strong><small>{scoreboard.difficulty.toUpperCase()} · {scoreboard.gameOver ? "RUN ENDED" : "RUN ACTIVE"}</small></div></div><div className="difficulty-picker"><div><p className="panel-label">DIFFICULTY</p><strong>Lives per run</strong></div>{([['intern','INTERN','Infinite life'],['analyst','ANALYST','5 lives'],['associate','ASSOCIATE','4 lives'],['vp','VP','3 lives'],['director','DIRECTOR','2 lives'],['md','MD','1 life']] as [Difficulty,string,string][]).map(([id,label,detail]) => <button key={id} className={scoreboard.difficulty === id ? "active" : ""} onClick={() => onDifficulty(id)}><strong>{label}</strong><small>{detail}</small></button>)}</div><div className="mode-cards"><button onClick={() => onSelect("craft")}><span>✣</span><small>STRUCTURE GAME</small><strong>CRAFT</strong><p>Build a priced multi-leg product against client constraints and a live budget.</p><b>ENTER →</b></button><button onClick={() => onSelect("greekthon")}><span>Δ</span><small>FLASH GAME</small><strong>GREEKTHON</strong><p>Read changing fair value and Greeks before the countdown expires.</p><b>ENTER →</b></button><button onClick={() => onSelect("hedge")}><span>≋</span><small>RISK GAME</small><strong>HEDGE</strong><p>Rebalance a structured-product book until its residual Greeks fit the desk limits.</p><b>ENTER →</b></button></div><QuestionBankPanel bank={bank} onInstallBank={onInstallBank} /></section>;
}

export function Collection({ name, scoreboard, onRename, onResetScore }: { name: string; scoreboard: Scoreboard; onRename: (name: string) => void; onResetScore: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const total = scoreboard.craft.score + scoreboard.greekthon.score + scoreboard.hedge.score;
  const winRate = scoreboard.craft.rounds ? scoreboard.craft.wins / scoreboard.craft.rounds * 100 : 0;
  const accuracy = scoreboard.greekthon.answers ? scoreboard.greekthon.correct / scoreboard.greekthon.answers * 100 : 0;
  return (
    <section className="mode-view">
      <div className="collection-heading">
        <div>
          <div className="player-title"><p className="eyebrow">{name.toUpperCase()} · PLAYER SETTLEMENT</p><button onClick={() => { setDraftName(name); setEditingName(true); }}>EDIT NAME</button></div>
          {editingName && <form className="rename-form" onSubmit={(event) => { event.preventDefault(); if (!draftName.trim()) return; onRename(draftName); setEditingName(false); }}><input autoFocus maxLength={30} value={draftName} onChange={(event) => setDraftName(event.target.value)} /><button type="submit" disabled={!draftName.trim()}>SAVE</button><button type="button" onClick={() => setEditingName(false)}>CANCEL</button></form>}
          <h1>One score. Three games.</h1>
        </div>
        <div className="level-card">
          <span>TOTAL SCORE</span>
          <strong>{total}</strong>
          <small>CRAFT + GREEKTHON + HEDGE</small>
        </div>
      </div>
      <div className="collection-stats">
        <strong>
          {scoreboard.craft.score} <small>CRAFT POINTS</small>
        </strong>
        <strong>
          {scoreboard.greekthon.score} <small>GREEKTHON POINTS</small>
        </strong>
        <strong>
          {scoreboard.hedge.score} <small>HEDGE POINTS</small>
        </strong>
        <strong>
          {scoreboard.craft.rounds + scoreboard.greekthon.answers + scoreboard.hedge.rounds} <small>TOTAL ROUNDS</small>
        </strong>
        <strong className={scoreboard.gameOver ? "dead" : "alive"}>
          {scoreboard.difficulty === "intern" ? "INFINITE LIFE" : scoreboard.gameOver ? "OUT" : `${scoreboard.lives}/${scoreboard.maxLives}`} <small>{scoreboard.gameOver ? "RUN ENDED" : "LIVES LEFT"}</small>
        </strong>
      </div>
      <div className="life-rule"><strong>{scoreboard.difficulty.toUpperCase()} · {scoreboard.difficulty === "intern" ? "UNLIMITED LIVES" : `${scoreboard.maxLives}-LIFE RUN`}</strong><span>Failed Craft submission: {scoreboard.difficulty === "intern" ? "no life lost" : "−1 life"}</span><span>Wrong Greekthon answer: {scoreboard.difficulty === "intern" ? "no life lost" : "−1 life"}</span><span>Failed Hedge: {scoreboard.difficulty === "intern" ? "no life lost" : "−1 life"}</span><span>Timeout: {scoreboard.difficulty === "intern" ? "no life lost" : "−1 life"}</span></div>
      <div className="settlement-grid">
        <article><span>CRAFT</span><strong>{scoreboard.craft.score}</strong><small>{scoreboard.craft.wins}/{scoreboard.craft.rounds} passed · {winRate.toFixed(0)}% win rate</small><b>BEST ROUND {scoreboard.craft.best}</b></article>
        <article><span>GREEKTHON</span><strong>{scoreboard.greekthon.score}</strong><small>{scoreboard.greekthon.correct}/{scoreboard.greekthon.answers} correct · {accuracy.toFixed(0)}% accuracy</small><b>BEST STREAK ×{scoreboard.greekthon.bestStreak}</b></article>
        <article><span>HEDGE</span><strong>{scoreboard.hedge.score}</strong><small>{scoreboard.hedge.passed}/{scoreboard.hedge.rounds} books inside limits</small><b>BEST ROUND {scoreboard.hedge.best}</b></article>
      </div>
      <section className="recent-settlements">
        <div className="settlement-head"><div><p className="panel-label">RECENT SETTLEMENTS</p><h2>{scoreboard.gameOver ? "Final score ledger" : "Current run ledger"}</h2></div><button onClick={onResetScore}>NEW RUN</button></div>
        {scoreboard.recent.length ? scoreboard.recent.map((entry, index) => <div className="settlement-row" key={`${entry.at}-${index}`}><span>{entry.game}</span><strong>{entry.label}</strong><small>{entry.at}</small><b className={entry.score >= 0 ? "positive" : "negative"}>{entry.score >= 0 ? "+" : ""}{entry.score}</b></div>) : <div className="empty-ledger">Complete a round in any game to start the ledger.</div>}
      </section>
    </section>
  );
}


