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

Practice product structuring, Greek intuition, and hedging judgment under time pressure. All three modes share one score, one life pool, and one local player record.

## At a glance

| | Focus | Core decision |
| --- | --- | --- |
| **Craft** | Product structuring | Build a book that meets the client mandate |
| **Greekthon** | Greek intuition | Call the direction of value or a Greek |
| **Hedge** | Risk management | Choose tools that reduce dealer exposure |

## Game modes

### ✣ Craft · Structure the product

A client arrives with a mandate: protect capital, retain upside, include a required instrument, and respect a target budget.

Build one leg at a time. Go long or short, set position sizes, choose strikes and maturities, and tune bond face values or coupon rates. Every instrument has a live market price, and the book updates as you edit it.

Your structure must satisfy every hard requirement before time expires. Overspending is allowed, but every excess makes the deal less efficient and costs points.

The strongest structures are not merely valid. They are efficient.

### Δ Greekthon · Read the shock

A position flashes onto the screen. Then the market changes. Decide whether fair value, delta, gamma, vega, theta, or rho goes **up**, stays **unchanged**, or goes **down**.

Questions may contain a single option or a combined position. As the run continues, decisions arrive faster.

Answers are evaluated at the displayed four-decimal precision. After an answer or timeout, the result remains visible for three seconds for review.

### ≋ Hedge · Rebalance the book

The desk has sold a structured product. The market has moved, and its risk must be rebalanced.

Each round presents a selloff, rally, volatility shock, or volatility crush. Read the product from the dealer's side, identify its exposures, and select one or more stock or option tools.

The dealer's objective is to reduce the selected Delta, Gamma, Vega, Theta, and Rho exposure, not to predict the market. Exact Greeks stay hidden while you decide; QuantLib reveals the before-and-after values after submission.

## Difficulty and scoring

Craft, Greekthon, and Hedge share the same score and life pool. A failed mandate, wrong risk call, poor hedge response, or expired timer can cost a life. When the last life is gone, the run ends and the result is recorded in Collection.

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

All three modes draw from one validated JSON question bank. Download the example bank, customize the Craft mandates, Greekthon scenarios, option books and metrics, or Hedge product templates, then upload it in the app.

When local storage is enabled, the player profile, scoreboard, and uploaded question bank stay in that browser. QuantCraft uses no advertising or tracking cookies.

## Development

Requirements: Node.js 18 or newer and npm.

Use the management script for common workflows:

```bash
./manage.sh compile      # build the kernel and type-check the app
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

`npm run dev` builds the local market kernel and starts Vite.

```bash
npm run build        # production build
npm run lint         # source linting
npm run test:kernel  # market-kernel tests
npm run preview      # preview the production build
```

## Architecture and privacy

- React 19 and TypeScript 6 frontend
- Vite 8 build and development server
- Official QuantLib 1.43 compiled to WebAssembly
- Local TypeScript wrapper in [`packages/market-kernel`](packages/market-kernel)
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

The application is licensed under [AGPL-3.0](LICENSE). The `@quantcraft/market-kernel` package is licensed separately under BSD-3-Clause.
