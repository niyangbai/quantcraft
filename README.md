<p align="center">
	<img src="./public/favicon.svg" width="96" alt="QuantCraft logo" />
</p>

<h1 align="center">QuantCraft</h1>

<p align="center">
	<a href="https://github.com/niyangbai/quantcraft/actions/workflows/deploy-pages.yml"><img src="https://github.com/niyangbai/quantcraft/actions/workflows/deploy-pages.yml/badge.svg" alt="Deploy to GitHub Pages" /></a>
	<a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3" /></a>
</p>

<p align="center">
	<a href="https://niyangbai.github.io/quantcraft/"><strong>▶ PLAY QUANTCRAFT ONLINE</strong></a>
</p>

**QuantCraft** is a free, browser-based trainer for financial-market intuition. Financial analyst don't learn from reading formulas — they learn by seeing thousands of payoffs, order books, and market shocks until the right call becomes reflex. QuantCraft gives you that repetition: fast, scored drills you can run anywhere, without risking a dollar.

> No download, no account, no backend — everything runs in your browser. Every drill shares one score, one streak, and one pool of lives, so you practice the whole desk, not just one skill.

## The games

| Game | You're asked to… |
| --- | --- |
| **∑ Payoff** | Call the terminal payoff, max profit, or breakeven of a random position — any mix of legs, long or short |
| **☰ Order Book** | Call how a market order changes a live, persistent order book |
| **Δ Greek** | Call whether a position's value, delta, gamma, vega, theta, or rho goes up, down, or flat |
| **≋ Hedge** | Rebalance a dealer's book after a market shock with the right trades |
| **⇄ Make Market** | Post the two-sided quote a market maker would choose |
| **σ Volatility** | Read a shocked volatility surface (in 3D) and find the best vol trade |
| **∿ Curve** | Read a yield-curve move and find the bond position that pays |
| **◈ Exotic** | Find the exotic position a market shock hurts the most |

Each game is a clean loop: a market scenario appears, you decide, the answer is revealed with the reasoning, and you move on.

## How a run works

Pick a pressure level, then play any mix of games. Correct calls build your streak and score; mistakes and timeouts cost a life. When the lives run out, the run ends.

| Level | Lives |
| --- | ---: |
| **Intern** | Infinite |
| **VP** | 5 |
| **MD** | 1 |

**Collection** records your combined score, per-game accuracy, best streaks, and recent results, so you can watch your edge build over time.

## Make it yours

Every game is driven by a single question bank. Download the example, edit the positions, scenarios, and parameters to your liking, and upload it back to play your own. Your name, progress, and custom bank stay in your browser — no accounts and no tracking.

## Run it locally

Requirements: Node.js 18 or newer.

```bash
npm install          # first-time setup only
./manage.sh run      # start the development server
./manage.sh build    # production build
./manage.sh test     # run the full test suite
```

Run `./manage.sh help` to see every command (`lint`, `compile`, `preview`, …).

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/niyangbai/quantcraft/issues/new).

## License

QuantCraft is licensed under [AGPL-3.0](LICENSE).
