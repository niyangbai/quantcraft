# Game modules

Each game lives in its own folder under `src/games/<mode-id>/` with one
uniform shape:

```
src/games/<mode-id>/
├── game.ts     — the mode's logic: generation, state transitions, templates,
│                 seeds, and the AI prompt. Pure functions, no React.
├── <Mode>.tsx  — the React component. Composes the shared UI kit from
│                 src/ui (GameFrame + ScenarioCard + PositionBook /
│                 OrderBookCard + ChoiceGrid + RevealBar) and calls game.ts.
└── index.ts    — public surface: `export { Mode } from "./Mode";
                  export * from "./game";`
```

Folder names are kebab-case (`order-book`, `payoff`, `greek`, `hedge`, `make-market`, `volatility`, `curve`, `exotic`) and
match the `Mode` union values in `src/game.ts`. Component files are
PascalCase; logic files are always named `game.ts`.

## Adding a new game

1. Create `src/games/<mode-id>/` with `game.ts`, `<Mode>.tsx`, `index.ts`.
2. Put any reusable math in `@quantcraft/finmath` (new module + subpath
   export); keep game-specific generation/distractors/prompts in `game.ts`.
3. Register the mode:
   - `src/game.ts` — add the id to `Mode`, a stats block to `Scoreboard`,
     a key to `QuestionBank`, and validate/default it in `parseQuestionBank`.
     The bank entry can be a seed array (payoff/orderbook) or a params object
     (`make-market` stores the synthetic model's `riskAversion`, `arrival`,
     `fillSensitivity`, `adverseFraction`; `volatility` stores the fixed
     `riskFreeRate` and `dividendYield` of the vol-surface model).
   - `src/App.tsx` — route + `record*` handler.
   - `src/ui/controls.tsx` — `GameMode` union + scoreboard branch.
   - `src/ui/pages.tsx` — landing card + collection settlement card.
4. Add `src/games/<mode-id>/game.ts` to `test/tsconfig.json` and write
   `test/<mode-id>.test.mjs` for the logic.

Shared app types and helpers stay in `src/game.ts`; everything visual stays
in `src/ui`.
