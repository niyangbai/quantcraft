# QUANTCRAFT

[![Deploy to GitHub Pages](https://github.com/niyangbai/quantcraft/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/niyangbai/quantcraft/actions/workflows/deploy-pages.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![QuantLib 1.43](https://img.shields.io/badge/QuantLib-1.43-24383A)](https://www.quantlib.org/)

**Play online:** [https://niyangbai.github.io/quantcraft/](https://niyangbai.github.io/quantcraft/)

> QuantCraft is a fully frontend, browser-only financial-markets game with no backend dependency. Pricing runs locally through QuantLib WebAssembly.

QuantCraft tests product structuring, Greek intuition, and hedging judgment under time pressure. Its three modes share one score, one life pool, and one local player record.

## Game modes

### ✣ Craft

A client arrives with a mandate: protect capital, retain upside, include a required instrument, and respect a target budget.

Build the product one leg at a time. Go long or short, set the position size, choose strikes and maturities, and tune bond face values or coupon rates. Every instrument has a live market price, and the whole book moves as you edit it.

Your structure must satisfy every hard requirement before time expires. Budget is different: you may overspend, but every excess makes the deal less elegant and costs points.

The strongest structures are not merely valid. They are efficient.

### Δ Greekthon

A position flashes onto the screen. Then the market changes.

Will fair value rise, stay unchanged, or fall? What happens to delta, gamma, vega, theta, or rho? Read the book, read the shock, and choose **up**, **unchanged**, or **down** before the clock runs out.

Questions may contain a single option or a combined position. As the run continues, decisions arrive faster. Build a streak, trust your risk intuition, and do not hesitate.

Answers are evaluated at the displayed four-decimal precision. After an answer or timeout, the result remains visible for three seconds for review.

### ≋ Hedge

The desk has sold a structured product. The market has moved, and its risk must be rebalanced now.

Each round presents a selloff, rally, volatility shock, or volatility crush. Read the product from the dealer's side, identify its exposures, then select one or more stock and option tools to reduce the combined Delta, Gamma, Vega, Theta, and Rho risk. The dealer's objective is risk neutralization, not a market prediction.

Exact Greeks stay hidden while you decide. After submission, QuantLib reveals the before-and-after Greeks and explains the strongest multi-tool response. The game rewards hedge intuition rather than solving for an exact quantity.

## Difficulty and scoring

Craft, Greekthon, and Hedge share the same score and the same pool of lives. A failed mandate, wrong risk call, poor hedge response, or expired timer can cost a life. When the last life is gone, the run ends and the result is recorded in your Collection.

Choose the pressure level before starting:

| Level | Lives |
| --- | ---: |
| Intern | Infinite life |
| Analyst | 5 |
| Associate | 4 |
| VP | 3 |
| Director | 2 |
| MD | 1 |

The Collection records the combined score, per-mode results, accuracy, streaks, best rounds, remaining lives, and recent settlements.

## Shared question bank

All three modes draw from one validated JSON question bank. Download the example bank, customize the Craft mandates, Greekthon scenarios, option books and metrics, or Hedge product templates, then upload it in the app.

When local storage is enabled, the player profile, scoreboard, and uploaded question bank stay in that browser. QuantCraft uses no advertising or tracking cookies.

## Local development

Requirements: Node.js 18 or newer and npm.

Use the project management script for the common workflows:

```bash
./manage.sh compile      # build the kernel and type-check the app
./manage.sh build        # production build
./manage.sh run          # development server
```

Run `./manage.sh help` for all commands. Arguments after `run` are passed to
Vite, such as `./manage.sh run --host 0.0.0.0`.

The underlying npm commands remain available:

```bash
npm install
npm run dev
```

The development command builds the local market kernel and starts Vite.

```bash
npm run build        # production build
npm run lint         # source linting
npm run test:kernel  # market-kernel tests
npm run preview      # preview the production build
```

## Architecture

- React 19 and TypeScript 6 frontend
- Vite 8 build and development server
- Official QuantLib 1.43 compiled to WebAssembly
- Local TypeScript wrapper in [`packages/market-kernel`](packages/market-kernel)
- Browser Local Storage for optional persistence
- GitHub Actions deployment to GitHub Pages

The application is entirely client-side. Market inputs and player data are not sent to a QuantCraft backend.

## License

The application is licensed under [AGPL-3.0](LICENSE). The `@quantcraft/market-kernel` package is licensed separately under BSD-3-Clause.
