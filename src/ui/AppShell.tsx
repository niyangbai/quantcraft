import type { ReactNode } from "react";
import type { Difficulty, RuntimeState } from "../game";

/**
 * The application shell every screen lives inside: top bar (brand, engine
 * status, repo link, player avatar), the runtime error banner, the page
 * transition container, and the footer.
 */
export function AppShell({
  runtime,
  profileName,
  transitionKey,
  onHome,
  onCollection,
  children,
}: {
  runtime: RuntimeState;
  profileName?: string;
  transitionKey: string;
  onHome: () => void;
  onCollection: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-mark brand-button" onClick={onHome} aria-label="Back to home"><span className="brand-dot" />QUANT<span>CRAFT</span></button>
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
          onClick={onCollection}
          aria-label="Open collection"
          title="Collection"
        >
          {profileName ? profileName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() : "?"}
        </button>
      </header>
      {runtime.status === "error" && (
        <div className="runtime-error">
          QuantLib failed to load: {runtime.error}
        </div>
      )}
      <main className="main-content">
        <div className="page-transition" key={transitionKey}>
          {children}
        </div>
      </main>
      <footer className="site-footer">
        <div>
          <div className="footer-brand"><span className="brand-dot" aria-hidden="true" /><strong>QUANT<span>CRAFT</span></strong></div>
          <p>For educational and entertainment purposes only. Nothing in this game is financial, investment, trading, legal, or tax advice. Prices and model outputs are illustrative.</p>
          <nav aria-label="Footer links"><a href="https://github.com/niyangbai/quantcraft/blob/master/LICENSE" target="_blank" rel="noreferrer">LICENSE</a></nav>
        </div>
      </footer>
    </div>
  );
}

/** Shown when the run's last life is lost. */
export function GameOverScreen({
  difficulty,
  totalScore,
  onCollection,
  onNewRun,
}: {
  difficulty: Difficulty;
  totalScore: number;
  onCollection: () => void;
  onNewRun: () => void;
}) {
  return (
    <section className="game-over">
      <span>RUN OVER · {difficulty.toUpperCase()}</span>
      <h1>No lives left.</h1>
      <strong>{totalScore} PTS</strong>
      <div><button onClick={onCollection}>VIEW SETTLEMENT</button><button onClick={onNewRun}>NEW RUN</button></div>
    </section>
  );
}
