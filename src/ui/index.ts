// src/ui — the shared UI kit for game modes.
//
// Every mode composes these blocks: a GameFrame page shell, a ScenarioCard
// for the market event / question, a PositionBook for the position legs, a
// ChoiceGrid for answers or tools, and a RevealBar for the settled result.
// Add a new mode by composing these in a new component and registering the
// mode in game.ts (Mode union) and App.tsx (route + record* handler).

import "./game.css";

export { GameFrame } from "./GameFrame";
export type { GameMode } from "./GameFrame";

export { ScenarioCard } from "./ScenarioCard";
export type { Metric } from "./ScenarioCard";

export { PositionBook } from "./PositionBook";
export type { PositionLeg } from "./PositionBook";

export { ChoiceGrid } from "./ChoiceGrid";
export type { ChoiceItem } from "./ChoiceGrid";

export { RevealBar } from "./RevealBar";
export type { RevealCell } from "./RevealBar";
