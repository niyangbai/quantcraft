# QuantCraft

## 1. Product Definition

QuantCraft is a browser-based game for learning and practicing structured products, exotic derivatives, and QIS through direct manipulation, experimentation, and short game loops.

It should feel like a playful market-crafting game first and a finance learning tool second.

The core fantasy is:

> Build strange things with markets, test them, break them, and discover how they work.

QuantCraft is inspired conceptually by the immediacy of TensorFlow Playground, the visual composability of Scratch, the discovery loop of Little Alchemy, and the progression structure of lightweight educational games.

It must **not** feel like Bloomberg, a bank pricing system, an interview question bank, a CFA course, or a generic financial calculator with XP added on top.

---

## 2. Final Product Goal

The final goal is to help a user develop real structuring and QIS intuition by playing.

A user who spends time in QuantCraft should gradually become better at:

- understanding how structured-product payoffs are assembled;
- decomposing products into simpler financial building blocks;
- connecting coupon, protection, optionality, volatility, skew, correlation, maturity, and funding;
- predicting how a product reacts when market variables move;
- understanding basic dealer-side risk and hedging intuition;
- designing simple systematic strategies;
- understanding backtest fragility, transaction costs, overfitting, and regime dependence;
- reasoning through the types of questions asked in QIS, structuring, derivatives, and quant-strats interviews.

The learning objective must remain mostly invisible during gameplay.

The player should think:

> "I am playing with market machines."

Not:

> "I am completing a derivatives course."

---

## 3. Product Boundary

### QuantCraft IS

- a game;
- a sandbox;
- a visual payoff builder;
- a short-session learning product;
- a structured-product experimentation environment;
- a QIS strategy playground;
- a lightweight pricing and simulation environment;
- a collection/discovery game;
- an interview-intuition trainer hidden inside game mechanics.

### QuantCraft IS NOT

Do not turn the product into any of the following:

- a professional production-grade pricing library;
- a trade booking platform;
- a Bloomberg clone;
- a real-money trading simulator;
- an investment-advice product;
- a portfolio-management platform;
- a full stochastic-calculus course;
- an LMS with chapters, lectures, quizzes, and completion percentages;
- a LeetCode-style interview question bank;
- a dashboard that exposes every metric at once;
- a multiplayer game in the MVP;
- a backend-heavy social network;
- a market-data terminal;
- an attempt to support every exotic model or product.

Whenever there is tension between "more financial completeness" and "better game feel", prefer the game feel for the MVP.

Whenever there is tension between "more features" and "clearer core loop", prefer the clearer core loop.

---

## 4. Core Design Principles

### 4.1 Everything is a toy first, model second

Financial concepts should be represented as objects the user can drag, combine, tune, stress, and break.

Examples:

- Bond = stable base ingredient
- Call = upside ingredient
- Put = downside ingredient
- Barrier = trigger component
- Coupon = reward component
- Volatility = market weather / instability
- Correlation = linkage between assets
- Momentum = strategy signal component
- Vol Target = stabilizer component

The user should be able to understand the effect of an object by interacting with it before reading a definition.

### 4.2 Discover, do not lecture

Do not begin missions with explanations such as:

> "Today you will learn reverse convertibles."

Instead give the player a problem and let the structure emerge naturally.

Example:

> "A client wants a high coupon and accepts equity downside risk."

The player experiments with Bond + Short Put and discovers a Reverse Convertible.

### 4.3 Prediction before reveal

Do not reveal every answer in real time.

Whenever possible use:

1. player makes a choice or prediction;
2. player runs a tool / simulation;
3. result is revealed;
4. short feedback explains why.

This creates a game loop instead of a calculator loop.

### 4.4 Finance mechanics are the gameplay

The game should remain interesting even if XP, coins, badges, and streaks are removed.

The actual fun should come from:

- combining payoff components;
- modifying structures;
- discovering recipes;
- predicting behavior;
- stressing products;
- surviving market events;
- improving a structure under constraints;
- finding hidden flaws in backtests;
- balancing client appeal, risk, and economics.

### 4.5 Short sessions

A normal mission should take approximately 3 to 8 minutes.

The player should be able to:

- open QuantCraft;
- complete one useful interaction;
- get a reward or discovery;
- leave satisfied.

---

## 5. Core Game Loop

The primary loop is:

**Receive → Craft → Experiment → Reveal → Reward → Upgrade → Next**

Detailed flow:

1. Receive a short client / market / strategy prompt.
2. Craft a product or strategy using visual components.
3. Experiment by changing parameters or components.
4. Run a pricer, historical test, or scenario.
5. Reveal the result.
6. Receive qualitative and quantitative feedback.
7. Earn XP / coins / discoveries where appropriate.
8. Unlock a new ingredient, recipe, model, or world.
9. Start the next mission immediately.

The end of every mission should have a strong `NEXT CRAFT` action.

---

## 6. Main Modes

The product should have five primary modes plus one unrestricted sandbox.

### 6.1 Craft

This is the main progression / career mode.

The player receives lightweight NPC briefs and builds products to satisfy them.

Example:

> Sophie is moderately bullish on European equities but is nervous about a large crash. She wants more yield than cash and a maximum 3-year maturity.

The player crafts a structure and gets reactions from:

- Client
- Desk
- Risk
- Quanti

Primary skills trained invisibly:

- product selection;
- payoff construction;
- risk/reward trade-offs;
- coupon economics;
- structured-product decomposition;
- client suitability intuition.

### 6.2 Puzzles

Short challenges based on one concept.

Examples:

- increase coupon to 10% by changing only one term;
- repair a product whose economics are too expensive;
- predict whether fair value rises or falls after a volatility move;
- find the flaw in a suspiciously strong backtest;
- choose which hedge best reduces a given exposure;
- identify what hidden option the investor is effectively selling.

This is where many interview-style questions are hidden.

Never label it "Interview Questions".

### 6.3 Market Mayhem

A survival mode focused on risk intuition.

The player owns one or more products and advances through market days.

Market events can include:

- calm market;
- equity rally;
- equity crash;
- volatility spike;
- skew steepening;
- rates shock;
- correlation breakdown.

The player can use simple hedge instruments and try to keep Desk Capital alive.

The objective is not necessarily maximum P&L. The main objective is to survive and understand what is hurting the position.

### 6.4 Quant Lab

The QIS playground.

The player visually constructs systematic strategies using components such as:

- asset;
- return;
- momentum;
- moving average;
- volatility;
- ranking;
- weighting;
- leverage;
- vol target;
- rebalance frequency;
- transaction costs;
- cap / floor;
- cash allocation.

The player runs historical tests and immediately sees how the strategy changes.

The emphasis is experimentation, not finding one "correct" strategy.

### 6.5 Bosses

High-intensity composite challenges that change the normal rules.

Examples:

#### The Vol Monster

Continuously increases volatility and changes spot.

The player must keep a product or small book under control.

#### The Correlation Dragon

Changes asset correlations and attacks basket / worst-of structures.

#### The Overfitter

Starts with an apparently perfect strategy. The player must expose hidden problems such as:

- look-ahead bias;
- parameter mining;
- missing transaction costs;
- hidden leverage;
- poor out-of-sample behavior.

Bosses should feel memorable and visually distinct.

### 6.6 Playground

No progression requirements.

All supported components are available.

No mission, no scoring, no client constraints.

The user can freely:

- build a payoff;
- build a QIS strategy;
- price;
- simulate;
- stress;
- backtest.

This mode is for advanced users and experimentation.

---

## 7. Homepage and Navigation

Do not expose all complexity on the landing page.

The homepage should have one dominant CTA:

`PLAY`

Suggested structure:

```text
QUANTCRAFT

Build weird things with markets.

[ PLAY ]

Daily Craft      🔥 3
Your Lab         Lv. 7

Continue
The Nervous Bull
```

Secondary navigation can expose:

- Craft
- Puzzles
- Mayhem
- Quant Lab
- Collection
- Playground

The player should not be forced to choose between six unfamiliar modes before their first interaction.

---

## 8. First-Time User Experience

The first meaningful action should occur within 30 seconds.

Do not require:

- account creation;
- skill-level selection;
- tutorial slides;
- finance definitions;
- model configuration.

First mission example:

Quanti asks:

> "Can you make this €100 grow without risking the €100?"

The user sees only:

- €91 Bond
- €9 Call

They drag the two together.

Result:

```text
✨ NEW DISCOVERY ✨

CAPITAL PROTECTED NOTE

Principal protected
Upside participation

+100 XP
```

Then show the payoff curve moving.

This is the first Aha moment:

> "Financial products can be assembled like Lego."

---

## 9. Crafting System

The core visual language should be cards / blocks / ingredients.

### Basic ingredient categories

#### Market

- SPX
- SX5E
- EURUSD
- cash
- rate

#### Building blocks

- bond
- call
- put
- digital

#### Logic / payoff operators

- add
- subtract
- multiply
- divide
- max
- min
- if
- above
- below

#### Structured-product features

- coupon
- barrier
- knock-in
- knock-out
- autocall
- cap
- floor
- participation
- capital protection
- basket
- worst-of

#### QIS components

- return
- momentum
- moving average
- realized volatility
- ranking
- weighting
- rebalance
- vol target
- leverage
- transaction cost
- cash allocation

### Discovery system

Some known structures should emerge from combinations.

Examples:

- Bond + Call → Capital Protected Note
- Bond + Short Put → Reverse Convertible
- Coupon + Autocall Trigger + Downside Put Exposure → Autocall-style note

When a known structure is discovered, show a short celebration and add it to the Structure Book.

Do not require exact textbook replication for every discovery. The system can recognize approximate structural families.

---

## 10. Structure Book / Collection

Collection is a major retention mechanic.

The player collects:

- structures;
- ingredients;
- market events;
- models;
- strategy recipes;
- achievements.

Example:

```text
STRUCTURE BOOK

VANILLA       8 / 8
STRUCTURED   11 / 24
EXOTICS       4 / 31
QIS           7 / 42
???           0 / 12
```

Undiscovered products should sometimes show only hints.

Example:

```text
#27 ???

Hint:
Three assets enter.
Only the worst one matters.
```

The collection should create curiosity without requiring artificial grind.

---

## 11. Quanti Mascot

Quanti is a core UX element, not decorative branding.

Quanti handles:

- onboarding;
- hints;
- reactions;
- celebrations;
- lightweight explanations;
- error states;
- personality.

Tone:

- concise;
- dry / playful;
- never childish;
- never lecture-like.

Examples:

When coupon becomes extreme:

> "20% coupon? Where's the catch?"

After fair value reveals 84:

> "There it is."

Before a stress test:

> "Looks good. Try 2008."

After a volatility shock:

> "Your short vega noticed."

Quanti should never cover the screen with long explanatory paragraphs.

---

## 12. Feedback Design

The player should first see intuitive feedback and optionally expand into professional metrics.

Example:

### Chill presentation

```text
CLIENT     😍😍😍😍
RISK       🔥🔥🔥
VOL        🎈 Hates volatility
PROTECTION 🛡 Medium
```

### Expanded professional view

```text
Fair Value      98.24
Delta            0.43
Vega            -0.18
Gamma           -0.04
Coupon          10.2%
Barrier          60%
```

Support two presentation levels:

- Chill
- Pro

These should show the same underlying model, not separate game rules.

---

## 13. Reveal Mechanics

Avoid showing all outputs continuously.

### Pricing

Before pricing:

```text
FAIR VALUE
???
```

Button:

`PRICE IT`

After reveal:

```text
98.24

Desk Edge
+1.76%
```

### Stress

Before stress:

Ask the player to predict direction or outcome.

Then:

`BREAK IT`

Reveal:

- spot move;
- volatility move;
- product impact;
- dominant risk driver.

### Backtest

Do not initially expose every metric.

First show a narrative summary:

- survived 2020;
- struggled in 2022;
- high turnover;
- unstable parameter region.

Allow expansion into:

- Sharpe;
- volatility;
- max drawdown;
- turnover;
- hit ratio;
- transaction cost impact.

---

## 14. Daily Craft

Daily Craft should be a major return loop.

Everyone receives the same market assumptions and brief for the day.

Example:

```text
DAILY CRAFT

The Greedy Client

Coupon ≥ 12%
Protection ≥ 60%
Desk Edge ≥ 0.5%

[ PLAY ]
```

Possible scoring categories:

- most elegant;
- highest protection;
- highest margin;
- lowest complexity;
- best balanced.

For MVP, leaderboard/network functionality is optional. The daily challenge itself is more important than social ranking.

---

## 15. Interview Training Boundary

Interview preparation is a hidden design objective, not a visible primary mode.

Do not create a main navigation item called:

- Interview Prep
- Interview Questions
- Mock Interview

Instead encode interview-relevant concepts inside gameplay.

Examples:

### Interview concept
"Where does the coupon come from?"

### QuantCraft implementation
Player increases coupon and observes what protection / option exposure must change.

---

### Interview concept
"What happens to an autocall when volatility rises?"

### QuantCraft implementation
A Vol Storm hits. Player predicts the effect before revealing the result.

---

### Interview concept
"How do you know your QIS backtest is not overfit?"

### QuantCraft implementation
The Overfitter boss contains hidden look-ahead bias, costs, unstable parameters, and weak out-of-sample performance.

The player should acquire interview answers through repeated intuition-building rather than memorization.

---

## 16. Progression

Avoid generic labels such as Beginner / Intermediate / Advanced.

Use worlds.

Suggested progression:

### World 1 — Payoff Plains

- Bond
- Call
- Put
- Digital

### World 2 — Barrier Bay

- Knock-In
- Knock-Out
- Reverse Convertible

### World 3 — Autocall Alley

- Coupons
- Observation dates
- Autocall triggers
- Downside barriers

### World 4 — Vol Volcano

- Volatility
- Delta
- Gamma
- Vega
- Hedging

### World 5 — Correlation Caverns

- Basket
- Best-of
- Worst-of
- Correlation

### World 6 — Quant Forest

- Momentum
- Vol control
- Risk weighting
- Rebalancing
- Transaction costs

### World 7 — Overfit Mountains

- Robustness
- Parameter sensitivity
- Look-ahead bias
- Out-of-sample testing
- Regime dependence

World progression is primarily a presentation layer for content sequencing.

---

## 17. MVP Scope

The first implementation must stay intentionally small.

### Required MVP Pages

1. Home
2. Craft Mission
3. Playground
4. Quant Lab
5. Collection

Puzzles and Mayhem may initially be represented by a small number of mission types rather than fully separate systems.

### Required MVP Financial Components

#### Underlyings

- SPX-like synthetic equity index
- SX5E-like synthetic equity index
- Cash

Do not depend on live market data for the MVP.

Use deterministic bundled historical sample data or generated demo data.

#### Payoff primitives

- Bond
- Call
- Put
- Digital
- Coupon
- Barrier
- Cap
- Floor
- If
- Max
- Min

#### Recognized structures

- Call
- Put
- Capital Protected Note
- Reverse Convertible
- Simple Barrier Note
- Simple Autocall

#### QIS components

- return
- moving average
- momentum
- vol target
- rebalance
- transaction cost

#### Simulation / analytics

- payoff chart;
- simple historical replay;
- GBM Monte Carlo;
- basic fair-value estimate;
- simple finite-difference or bump Greeks where needed;
- basic scenario stress;
- basic backtest statistics.

### Required MVP Game Systems

- XP;
- simple coins or score;
- structure discovery;
- Structure Book;
- mission completion;
- Quanti feedback;
- Chill / Pro metric toggle;
- next mission flow.

### Explicitly Out of Scope for MVP

- authentication;
- multiplayer;
- cloud saves;
- live market data;
- server-side pricing;
- real trade execution;
- real portfolio management;
- voice input;
- LLM interviewer;
- social feed;
- user-generated public marketplace;
- Heston;
- local volatility;
- stochastic rates;
- PDE engines;
- full calibration;
- complex path-dependent multi-asset exotics;
- regulatory suitability workflows;
- mobile-native apps.

---

## 18. Frontend-Only Constraint

The MVP must be entirely frontend.

Recommended stack:

- React
- TypeScript
- Vite
- lightweight state management
- Web Workers for heavy simulations
- localStorage / IndexedDB for progress
- SVG / Canvas / a lightweight charting library for visualizations

No backend is required.

The app should run locally with:

```bash
npm install
npm run dev
```

and build with:

```bash
npm run build
```

---

## 19. Architecture

Use one internal expression graph / AST as the single source of truth.

Do not implement separate hardcoded logic for the UI, pricing, payoff chart, and simulation.

Suggested architecture:

```text
Visual Builder
      │
      ▼
Expression Graph / AST
      │
 ┌────┼─────────────┐
 │    │             │
 ▼    ▼             ▼
Payoff Backtest   Pricing
Engine Engine     Engine
                    │
                    ▼
              Monte Carlo
```

### Example expression

```ts
{
  type: "multiply",
  args: [
    {
      type: "max",
      args: [
        {
          type: "return",
          underlying: "SX5E",
          start: "T0",
          end: "T"
        },
        0
      ]
    },
    1.5
  ]
}
```

The visual builder should compile to this representation.

The engines interpret it.

---

## 20. Domain Model

Keep the domain model small.

### Underlying

```ts
interface Underlying {
  id: string;
  name: string;
  type: "equity" | "index" | "cash" | "strategy";
}
```

### Expression

```ts
type Expression =
  | ConstantExpression
  | MarketExpression
  | UnaryExpression
  | BinaryExpression
  | ConditionalExpression
  | OptionExpression
  | BarrierExpression;
```

### Product

```ts
interface Product {
  id: string;
  name?: string;
  underlying: Underlying | Underlying[];
  payoff: Expression;
  maturity: number;
  notional: number;
}
```

### Strategy

```ts
interface Strategy {
  id: string;
  universe: Underlying[];
  signal: Expression;
  weighting: Expression;
  rebalance: "daily" | "weekly" | "monthly";
  transactionCostBps: number;
}
```

### Mission

```ts
interface Mission {
  id: string;
  title: string;
  world: string;
  prompt: string;
  allowedBlocks: string[];
  successConditions: MissionCondition[];
  rewards: MissionReward[];
}
```

Missions should be data-driven rather than hardcoded into page components.

---

## 21. Visual Direction

The design should feel:

- polished;
- playful;
- tactile;
- slightly whimsical;
- modern;
- not childish;
- not cyberpunk;
- not terminal-like.

Reference qualities:

- spacious modern product UI;
- game-like cards;
- satisfying drag/drop;
- subtle motion;
- large readable numbers;
- visual payoff shapes;
- friendly mascot reactions;
- clear state changes.

Avoid:

- dense financial tables as the main interface;
- neon hacker aesthetics;
- excessive gradients;
- casino styling;
- fake trading-floor visuals;
- red/green everywhere;
- long tutorial text;
- tiny Bloomberg-style typography.

---

## 22. UX Rules

1. Every screen should have one obvious primary action.
2. Every completed action should create visible feedback.
3. Avoid more than 3 simultaneous primary metrics in Chill mode.
4. Professional metrics should be expandable.
5. Never require finance knowledge to complete the first mission.
6. Never punish experimentation heavily.
7. Failure should be informative, not discouraging.
8. Prefer "interesting, but expensive" over "wrong" when multiple structures are valid.
9. Keep Quanti messages short.
10. Every mission should end with a clear next action.

---

## 23. Example Mission

### The Greedy Client

Prompt:

> "I want a double-digit coupon. I don't mind some equity risk."

Constraints:

- coupon ≥ 10%;
- maturity ≤ 3 years;
- fair value ≤ 99.5;
- protection score ≥ 40.

Allowed ingredients:

- Bond
- Put
- Coupon
- Barrier
- SX5E

Player flow:

1. Build a structure.
2. Coupon updates approximately in the UI.
3. Fair value remains hidden.
4. Player clicks `PRICE IT`.
5. Result is revealed.
6. If economics fail, Quanti gives a short hint.
7. Player modifies structure.
8. Mission succeeds.
9. Reverse Convertible recipe may be discovered.
10. Player receives XP and advances.

Hidden learning objective:

Understand that a high coupon is financed by accepting downside optionality.

Do not display the hidden learning objective in the player UI.

---

## 24. Example QIS Mission

### Smooth Operator

Prompt:

> "Make equities less scary."

Goal:

- start from equity exposure;
- reduce realized volatility;
- retain meaningful upside;
- keep turnover reasonable.

Available blocks:

- Equity
- Realized Vol
- Vol Target
- Cash
- Rebalance
- Transaction Cost

Player builds:

```text
Equity
  ↓
Realized Vol
  ↓
10% Vol Target
  ↓
Dynamic Exposure
```

Then runs history.

First result layer:

```text
2020: 😬 survived
2022: 😐 struggled
Turnover: Medium
Drawdown: Much smaller
```

Expanded Pro layer:

- annualized return;
- volatility;
- Sharpe;
- max drawdown;
- turnover;
- cost drag.

Hidden learning objective:

Understand the mechanics and trade-offs of volatility targeting.

---

## 25. Product Success Criteria

The product is successful if a first-time user can say, after one short session:

> "I understand something about derivatives that felt confusing before."

and also:

> "I want to try another structure."

Both conditions matter.

A technically correct tool that nobody wants to replay is a failure.

A fun game that teaches no transferable intuition is also a failure.

---

## 26. Initial Product Metrics

For early development, optimize for:

### Time to First Craft

How quickly a new user completes their first meaningful structure.

### First Session Crafts

How many crafts a new user completes in the first session.

### Craft → Next Craft Rate

How often a player starts another mission after finishing one.

### Return Rate

Whether users return for Daily Craft / progression.

### Discovery Rate

How frequently users discover a new structure or mechanic.

Do not optimize early development around total simulations run or total time spent on a dashboard.

---

## 27. Codex Implementation Priority

Build in this order.

### Phase 1 — Playable Vertical Slice

Must produce one complete playable loop:

1. Home
2. First Craft mission
3. Drag/drop ingredients
4. Construct simple payoff
5. `PRICE IT`
6. Result reveal
7. Quanti reaction
8. Discovery animation
9. XP reward
10. `NEXT CRAFT`

Do not build broad feature coverage before this loop feels good.

### Phase 2 — Generalize Builder

- AST / expression engine
- reusable blocks
- payoff chart
- multiple simple structures
- mission data model
- collection system

### Phase 3 — Quant Lab

- historical dataset
- strategy graph
- backtest engine
- vol target
- momentum
- transaction costs

### Phase 4 — Stress / Mayhem

- scenario engine
- simple risk measures
- market event cards
- survival loop

### Phase 5 — Polish

- animations
- sound hooks (optional, muted by default)
- responsive layout
- onboarding quality
- better collection UI
- accessibility

---

## 28. Definition of Done for the First Prototype

The first prototype is done when all of the following are true:

- It runs entirely in the browser.
- A new user can press `PLAY` and begin immediately.
- The first useful interaction happens in under 30 seconds.
- The user can visually combine at least Bond + Call.
- The app recognizes and reveals a Capital Protected Note.
- A payoff visualization responds to the structure.
- The user can price at least one supported structure.
- Pricing has a deliberate reveal moment.
- Quanti reacts to the result.
- The user earns XP and sees a discovered recipe.
- The user can start a second mission without returning to a complex menu.
- A Playground page exists for unrestricted experimentation.
- A minimal Quant Lab exists with at least Momentum and Vol Target.
- The UI feels like a game, not a financial dashboard.

If the prototype does all of this cleanly, stop adding features and polish the core loop before expanding scope.

---

## 29. Non-Negotiable Product Rule

When deciding whether to add a feature, ask:

> Does this make crafting, experimenting, discovering, or understanding market behavior more fun?

If the answer is no, it probably does not belong in the first version of QuantCraft.

