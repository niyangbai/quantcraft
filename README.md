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

Practice payoff reflexes, market-microstructure intuition, Greek intuition, hedging judgment, market-making, and vol-surface reading under time pressure. All six modes share one score, one life pool, and one local player record.

## At a glance

| | Focus | Core decision |
| --- | --- | --- |
| **Payoff** | Terminal payoff reflex | Call the payoff, max profit, or breakeven of a position |
| **Order Book** | Market microstructure | Call how a market order moves the ladder |
| **Greek** | Greek intuition | Call the direction of value or a Greek |
| **Hedge** | Risk management | Choose tools that reduce dealer exposure |
| **Make Market** | Market making | Pick the quote the synthetic model scores best |
| **Volatility** | Vol-surface reading | Find the position the surface shock pays |

## Game modes

### ∑ Payoff · Call the payoff

A position flashes onto the screen with a terminal spot. Read the book and answer in one shot: the terminal payoff, the maximum profit, or the breakeven spot.

Questions ramp through five levels: **1 leg → 2 legs → 3 legs → quantity → long/short mixed**. Instruments cover equity, forward, call, put, digital, barrier, bond, and coupon legs. Every payoff is exact arithmetic — `Payoff = Σ quantity × signed instrument payoff` — no pricing engine is involved.

Correct answers score points and extend your streak; each two consecutive-correct milestone unlocks the next level. Wrong answers and timeouts show the per-leg working so the reflex sticks.

### ☰ Order Book · Read the ladder

A limit order book flashes onto the screen. A market order arrives — `MARKET BUY 200` — and one question follows: the new best ask, the fill VWAP, the new spread, or the remaining depth at a level. Four answers, one correct.

The book is **persistent**: it does not regenerate per question. Each market order executes against it in **price-time priority**, the ladder erodes or reprices level by level, and the next question reads the updated book. When the book runs too thin, a fresh book starts.

The matching engine lives in `@quantcraft/finmath` (`orderbook` module): deterministic market-order execution, best quotes, spread, and depth.

### Δ Greek · Read the shock

A position flashes onto the screen. Then the market changes. Decide whether fair value, delta, gamma, vega, theta, or rho goes **up**, stays **unchanged**, or goes **down**.

Questions may contain a single option or a combined position. As the run continues, decisions arrive faster.

Answers are evaluated at the displayed four-decimal precision. After an answer or timeout, the result remains visible for three seconds for review.

### ≋ Hedge · Rebalance the book

The desk has sold a structured product. The market has moved, and its risk must be rebalanced.

Each round presents a selloff, rally, volatility shock, or volatility crush. Read the product from the dealer's side, identify its exposures, and select one or more stock or option tools.

The dealer's objective is to reduce the selected Delta, Gamma, Vega, Theta, and Rho exposure, not to predict the market. Exact Greeks stay hidden while you decide; QuantLib reveals the before-and-after values after submission.

### ⇄ Make Market · Make the market

A fair value, an inventory position, and an uncertainty level flash onto the screen. Pick the bid/ask quote that maximizes **expected utility** under a deterministic synthetic market model: fill probability, spread capture, adverse selection, and an inventory risk penalty.

The model lives in `@quantcraft/finmath` (`marketmaking` module) and scores every candidate in closed form, so the machine always knows the best quote — wide quotes stop adverse selection, large positions lean toward de-risking, and uncertainty sets the optimal spread.

### σ Volatility · Read the surface

An implied-volatility surface and a parameterized shock flash onto the screen. Three option positions follow. Which one has the largest **positive vol P&L**?

Each round builds a base surface (`ATM`, skew, smile, term structure), applies one of six parameterized shocks — skew steepening/flattening, front- or back-end vol up, smile curvature up/down — and scores every position as `qty × vega × ΔIV`. The surface and the shocks are closed forms in `@quantcraft/finmath` (`volsurface` module): Vega is the analytic Black–Scholes–Merton vega, ΔIV comes straight from the rebuilt surface, so the machine always knows the answer — and the reveal shows exactly which factor (location, vega, size, or side) decided it.

## Difficulty and scoring

Payoff, Order Book, Greek, Hedge, Make Market, and Volatility share the same score and life pool. A wrong payoff, wrong book read, wrong risk call, poor hedge response, bad quote, missed vol P&L, or expired timer can cost a life. When the last life is gone, the run ends and the result is recorded in Collection.

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

All six modes draw from one validated JSON question bank. Download the example bank, customize the Payoff position seeds, Order Book ladder templates, Greek scenarios, option books and metrics, Hedge product templates, or the Make Market and Volatility model parameters, then upload it in the app.

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
npm test              # finmath + payoff + orderbook + makemarket + volatility + quantlibjs tests
npm run test:finmath  # @quantcraft/finmath package tests
npm run test:payoff   # payoff game-logic tests (node:test)
npm run test:orderbook# order-book game-logic tests (node:test)
npm run test:makemarket # make-market game-logic tests (node:test)
npm run test:volatility # volatility game-logic tests (node:test)
npm run test:quantlib # quantlibjs WASM-backed tests
npm run lint          # source linting
npm run preview       # preview the production build
```

The game-logic tests are pure node:test suites. `npm run test:payoff` (and the
order-book, make-market, and volatility siblings) compile the corresponding
`src/games/*/game.ts` into `test/dist/` and run `test/*.test.mjs` against it,
importing the math from `@quantcraft/finmath`.

## Architecture and privacy

- React 19 and TypeScript 6 frontend
- Vite 8 build and development server
- Single UI module in [`src/ui`](src/ui) — design tokens (`base.css`), game-mode blocks (`game.css`), page styles (`pages.css`), shared controls (`controls.tsx`), the app shell (`AppShell.tsx`), the page screens (`pages.tsx`), and the game-mode kit (`GameFrame`, `ScenarioCard`, `PositionBook`, `OrderBookCard`, `ChoiceGrid`, `RevealBar`). New modes and pages are assembled from existing modules
- One folder per game in [`src/games`](src/games) with a uniform shape: `game.ts` (logic, no React) + `<Mode>.tsx` (component) + `index.ts` (public surface). See [`src/games/README.md`](src/games/README.md) for the convention
- Workspace packages:
  - [`@quantcraft/finmath`](packages/finmath) — unified financial math with modular exports: `payoff` (terminal payoff, max profit, breakevens), `risk` (Greek aggregation, risk magnitude, best-hedge search, hedge quality), `orderbook` (price-time-priority market-order matching, best quotes, spread, depth), `marketmaking` (synthetic market model: fill probability, spread capture, adverse selection, inventory penalty → expected utility), and `volsurface` (parametric implied-vol surface, parameterized shocks, delta IV, analytic BSM vega, vol-only P&L)
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
