<p align="center">
	<img src="./public/favicon.svg" width="96" alt="QuantCraft logo" />
</p>

<h1 align="center">QuantCraft</h1>

<p align="center">
	<a href="https://github.com/niyangbai/quantcraft/actions/workflows/deploy-pages.yml"><img src="https://github.com/niyangbai/quantcraft/actions/workflows/deploy-pages.yml/badge.svg" alt="Deploy to GitHub Pages" /></a>
	<a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3" /></a>
	<a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" /></a>
	<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript 6" /></a>
	<a href="https://www.quantlib.org/"><img src="https://img.shields.io/badge/QuantLib-1.43-24383A" alt="QuantLib 1.43" /></a>
</p>

<p align="center">
	<a href="https://niyangbai.github.io/quantcraft/"><strong>▶ PLAY QUANTCRAFT ONLINE</strong></a>
</p>

> QuantCraft is a browser-based financial-markets game. It has no backend dependency: pricing runs locally through QuantLib WebAssembly.

Practice payoff reflexes, Greek intuition, and hedging judgment under time pressure. All three modes share one score, one life pool, and one local player record.

## At a glance

| | Focus | Core decision |
| --- | --- | --- |
| **Payoff** | Terminal payoff reflex | Call the payoff, max profit, or breakeven of a position |
| **Greekthon** | Greek intuition | Call the direction of value or a Greek |
| **Hedge** | Risk management | Choose tools that reduce dealer exposure |

## Game modes

### ∑ Payoff · Call the payoff

A position flashes onto the screen with a terminal spot. Read the book and answer in one shot: the terminal payoff, the maximum profit, or the breakeven spot.

Questions ramp through five levels: **1 leg → 2 legs → 3 legs → quantity → long/short mixed**. Instruments cover equity, forward, call, put, digital, barrier, bond, and coupon legs. Every payoff is exact arithmetic — `Payoff = Σ quantity × signed instrument payoff` — no pricing engine is involved.

Correct answers score points and extend your streak; each two consecutive-correct milestone unlocks the next level. Wrong answers and timeouts show the per-leg working so the reflex sticks.

### Δ Greekthon · Read the shock

A position flashes onto the screen. Then the market changes. Decide whether fair value, delta, gamma, vega, theta, or rho goes **up**, stays **unchanged**, or goes **down**.

Questions may contain a single option or a combined position. As the run continues, decisions arrive faster.

Answers are evaluated at the displayed four-decimal precision. After an answer or timeout, the result remains visible for three seconds for review.

### ≋ Hedge · Rebalance the book

The desk has sold a structured product. The market has moved, and its risk must be rebalanced.

Each round presents a selloff, rally, volatility shock, or volatility crush. Read the product from the dealer's side, identify its exposures, and select one or more stock or option tools.

The dealer's objective is to reduce the selected Delta, Gamma, Vega, Theta, and Rho exposure, not to predict the market. Exact Greeks stay hidden while you decide; QuantLib reveals the before-and-after values after submission.

## Difficulty and scoring

Payoff, Greekthon, and Hedge share the same score and life pool. A wrong payoff, wrong risk call, poor hedge response, or expired timer can cost a life. When the last life is gone, the run ends and the result is recorded in Collection.

Choose the pressure level before starting:

| Level | Lives |
| --- | ---: |
| Intern | Infinite life |
| Analyst | 5 |
| Associate | 4 |
| VP | 3 |
| Director | 2 |
| MD | 1 |

Collection records the combined score, per-mode results, accuracy, streaks, best rounds, remaining lives, and recent settlements.

## Shared question bank

All three modes draw from one validated JSON question bank. Download the example bank, customize the Payoff position seeds, Greekthon scenarios, option books and metrics, or Hedge product templates, then upload it in the app.

When local storage is enabled, the player profile, scoreboard, and uploaded question bank stay in that browser. QuantCraft uses no advertising or tracking cookies.

## Development

Requirements: Node.js 18 or newer and npm.

Use the management script for common workflows:

```bash
./manage.sh compile      # build the quantlibjs package and type-check the app
./manage.sh build        # production build
./manage.sh run          # development server
```

Run `./manage.sh help` for all commands. Arguments after `run` are passed to Vite, for example:

```bash
./manage.sh run --host 0.0.0.0
```

The underlying npm commands are also available:

```bash
npm install
npm run dev
```

`npm run dev` builds the local workspace packages and starts Vite.

```bash
npm run build         # production build
npm test              # finmath + payoff game + quantlibjs tests
npm run test:finmath  # @quantcraft/finmath package tests
npm run test:payoff   # payoff game-logic tests (node:test)
npm run test:quantlib # quantlibjs WASM-backed tests
npm run lint          # source linting
npm run preview       # preview the production build
```

The Payoff game-logic tests are pure node:test suites. `npm run test:payoff`
compiles `src/payoffGame.ts` into `test/dist/` and runs `test/payoff.test.mjs`
against it, importing the math from `@quantcraft/finmath`.

## Architecture and privacy

- React 19 and TypeScript 6 frontend
- Vite 8 build and development server
- Single UI module in [`src/ui`](src/ui) — design tokens (`base.css`), game-mode blocks (`game.css`), page styles (`pages.css`), shared controls (`controls.tsx`), the app shell (`AppShell.tsx`), the page screens (`pages.tsx`), and the game-mode kit (`GameFrame`, `ScenarioCard`, `PositionBook`, `ChoiceGrid`, `RevealBar`). New modes and pages are assembled from existing modules
- Workspace packages:
  - [`@quantcraft/finmath`](packages/finmath) — unified financial math with modular exports: `payoff` (terminal payoff, max profit, breakevens) and `risk` (Greek aggregation, risk magnitude, best-hedge search, hedge quality)
  - [`@quantcraft/quantlibjs`](packages/quantlibjs) — official QuantLib 1.43 compiled to WebAssembly with a TypeScript API
- Browser Local Storage for optional persistence
- GitHub Actions deployment to GitHub Pages

The application is entirely client-side. Market inputs and player data are not sent to a QuantCraft backend. Optional persistence uses browser Local Storage.

## Contact and issues

QuantCraft is an educational market-structure game. Feedback is welcome:

- **Bug reports:** [open a GitHub Issue](https://github.com/niyangbai/quantcraft/issues/new)
- **Feature ideas:** [start a feature discussion](https://github.com/niyangbai/quantcraft/issues/new)
- **Project contact:** [visit the QuantCraft repository](https://github.com/niyangbai/quantcraft)

When reporting a problem, include the mode, difficulty, browser, and reproduction steps.

## License

The application is licensed under [AGPL-3.0](LICENSE). The `@quantcraft/quantlibjs` package is licensed separately under BSD-3-Clause.
