import type { ReactNode } from "react";
import { GameScoreboard } from "../Controls";
import type { Scoreboard } from "../game";

export type GameMode = "payoff" | "greekthon" | "hedge";

/**
 * Page frame shared by every game mode: back button, scoreboard,
 * mode header (eyebrow + title + tools such as the timer), optional
 * intro copy, and the mode's own content. The mode class stays on the
 * root so modes can layer small customizations in their own CSS.
 */
export function GameFrame({
  mode,
  eyebrow,
  title,
  intro,
  onBack,
  scoreboard,
  tools,
  children,
}: {
  mode: GameMode;
  eyebrow: string;
  title: string;
  intro?: string;
  onBack: () => void;
  scoreboard: Scoreboard;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`mode-view game-page ${mode}`}>
      <button className="back-home" onClick={onBack}><span aria-hidden="true">←</span> BACK TO HOME</button>
      <GameScoreboard scoreboard={scoreboard} mode={mode} />
      <div className="mode-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {tools && <div className="header-tools">{tools}</div>}
      </div>
      {intro && <p className="mode-intro">{intro}</p>}
      {children}
    </section>
  );
}
