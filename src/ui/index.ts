// src/ui — the single UI module for the whole app.
//
// Everything visual lives here: the design tokens and base styles
// (base.css), the game-mode blocks (game.css), the page styles
// (pages.css), the shared controls (controls.tsx), the app shell
// (AppShell.tsx), the page screens (pages.tsx), and the game-mode kit
// (GameFrame, ScenarioCard, PositionBook, ChoiceGrid, RevealBar).
//
// To add a new game mode: compose the kit in a new component, register
// the mode in game.ts (Mode union) and App.tsx (route + record* handler),
// and layer any small mode-specific styling under the mode class that
// GameFrame puts on the page root.

import "./base.css";
import "./game.css";
import "./pages.css";

export { GameFrame } from "./GameFrame";
export { ScenarioCard } from "./ScenarioCard";
export type { Metric } from "./ScenarioCard";
export { PositionBook } from "./PositionBook";
export type { PositionLeg } from "./PositionBook";
export { OrderBookCard } from "./OrderBookCard";
export type { BookRow } from "./OrderBookCard";
export { ChoiceGrid } from "./ChoiceGrid";
export type { ChoiceItem } from "./ChoiceGrid";
export { RevealBar } from "./RevealBar";
export type { RevealCell } from "./RevealBar";
export { VolSurface3D } from "./VolSurface3D";

export { GameScoreboard, RoundTimer, RoundResult, AiPromptModal, SideBadge } from "./controls";
export type { GameMode } from "./controls";

export { AppShell, GameOverScreen } from "./AppShell";
export { Onboarding, QuestionBankPanel, Landing, Collection } from "./pages";
