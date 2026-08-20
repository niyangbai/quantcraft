import { useEffect, useMemo, useRef, useState } from "react";
import type { BondResult, OptionResult, QuantLibRuntime } from "@quantcraft/market-kernel";
import { ingredients, money, randomMission } from "./game";
import type { CraftLeg, CraftMission, IngredientId, Scoreboard } from "./game";
import { AiPromptModal, GameScoreboard, RoundResult, RoundTimer, Slider } from "./Controls";
import "./Craft.css";

export function Craft({
  ql,
  missions,
  onScore,
  onBack,
  scoreboard,
}: {
  ql?: QuantLibRuntime;
  missions: CraftMission[];
  onScore: (score: number, passed: boolean, label: string) => void;
  onBack: () => void;
  scoreboard: Scoreboard;
}) {
  const ROUND_SECONDS = 60;
  const nextUid = useRef(1);
  const [mission, setMission] = useState<CraftMission>(() => randomMission(missions));
  const market = mission.market;
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [legs, setLegs] = useState<CraftLeg[]>([]);
  const [selected, setSelected] = useState<number>();
  const [draft, setDraft] = useState<CraftLeg>();
  const [result, setResult] = useState<{
    delta: number;
    protection: number;
    protectionBounded: boolean;
    maturityAligned: boolean;
    hasRequiredLeg: boolean;
    passed: boolean;
    score: number;
  }>();
  const [aiPrompt, setAiPrompt] = useState<string>();
  const add = (kind: IngredientId) => {
    if (result) return;
    setSelected(undefined);
    setDraft({
      uid: nextUid.current,
      kind,
      side: "long",
      quantity: kind === "bond" ? 1 : 0.5,
      strike: market.strike,
      faceAmount: 100,
      couponRate: 5,
      maturityDate: market.maturityDate,
      cashPayoff: 10,
      barrier: Math.round(market.spot * .8),
      barrierType: "down-out",
      optionType: "call",
    });
  };
  const update = (uid: number, patch: Partial<CraftLeg>) => {
    if (result) return;
    if (draft?.uid === uid) {
      setDraft((current) => current ? { ...current, ...patch } : current);
      return;
    }
    setLegs((v) => v.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
    setResult(undefined);
  };
  const remove = (uid: number) => {
    if (result) return;
    setLegs((v) => v.filter((x) => x.uid !== uid));
    setSelected(undefined);
    setResult(undefined);
  };
  const closeEditor = () => { setDraft(undefined); setSelected(undefined); };
  const commitDraft = () => {
    if (!draft || result) return;
    setLegs((current) => [...current, draft]);
    nextUid.current += 1;
    closeEditor();
  };
  const active = draft ?? legs.find((x) => x.uid === selected);
  const editorOpen = Boolean(active);
  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(undefined);
        setSelected(undefined);
        return;
      }
      if (event.key !== "Tab") return;
      const editor = document.querySelector<HTMLElement>(".leg-editor");
      const focusable = editor?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editorOpen]);
  const activeQuote = useMemo(() => {
    if (!ql || !active) return undefined;
    const sign = active.side === "long" ? 1 : -1;
    if (active.kind === "equity") {
      const priced = ql.priceStock(market.spot);
      const distribution = ql.equityMoveProbabilities({
        evaluationDate: market.evaluationDate,
        maturityDate: market.maturityDate,
        spot: market.spot,
        riskFreeRate: market.rate,
        dividendYield: market.dividend,
        volatility: market.volatility,
      });
      const marketDistribution = ql.equityMoveProbabilities({
        evaluationDate: market.evaluationDate,
        maturityDate: market.maturityDate,
        spot: market.spot,
        riskFreeRate: market.expectedReturn,
        dividendYield: 0,
        volatility: market.volatility,
      });
      return {
        unit: priced.value,
        position: sign * active.quantity * priced.value,
        engine: "Stock + BSM process",
        distribution,
        marketDistribution,
      };
    }
    if (active.kind === "call" || active.kind === "put") {
      const priced = ql.priceEuropean({
        evaluationDate: market.evaluationDate,
        maturityDate: active.maturityDate,
        spot: market.spot,
        strike: active.strike,
        riskFreeRate: market.rate,
        dividendYield: market.dividend,
        volatility: market.volatility,
        type: active.kind,
      });
      return {
        unit: priced.value,
        position: sign * active.quantity * priced.value,
        engine: "AnalyticEuropeanEngine",
      };
    }
    if (active.kind === "digital") {
      const priced = ql.priceDigital({
        evaluationDate: market.evaluationDate,
        maturityDate: active.maturityDate,
        spot: market.spot,
        strike: active.strike,
        riskFreeRate: market.rate,
        dividendYield: market.dividend,
        volatility: market.volatility,
        type: active.optionType,
        cashPayoff: active.cashPayoff,
      });
      return { unit: priced.value, position: sign * active.quantity * priced.value, engine: "AnalyticEuropeanEngine" };
    }
    if (active.kind === "barrier") {
      const priced = ql.priceBarrier({
        evaluationDate: market.evaluationDate,
        maturityDate: active.maturityDate,
        spot: market.spot,
        strike: active.strike,
        barrier: active.barrier,
        barrierType: active.barrierType,
        riskFreeRate: market.rate,
        dividendYield: market.dividend,
        volatility: market.volatility,
        type: active.optionType,
      });
      return { unit: priced.value, position: sign * active.quantity * priced.value, engine: "AnalyticBarrierEngine" };
    }
    const priced =
      active.kind === "coupon"
        ? ql.priceFixedRateBond({
            evaluationDate: market.evaluationDate,
            issueDate: market.evaluationDate,
            maturityDate: active.maturityDate,
            settlementDays: 0,
            faceAmount: active.faceAmount,
            couponRate: active.couponRate / 100,
            frequency: 2,
            flatDiscountRate: market.rate,
          })
        : ql.priceZeroCouponBond({
            evaluationDate: market.evaluationDate,
            maturityDate: active.maturityDate,
            settlementDays: 0,
            faceAmount: active.faceAmount,
            flatDiscountRate: market.rate,
          });
    return {
      unit: priced.value,
      position: sign * active.quantity * priced.value,
      engine: "DiscountingBondEngine",
    };
  }, [
    ql,
    active,
    market.evaluationDate,
    market.maturityDate,
    market.expectedReturn,
    market.dividend,
    market.volatility,
    market.spot,
    market.rate,
  ]);
  const liveCost = useMemo(() => {
    if (!ql) return 0;
    return legs.reduce((total, leg) => {
      const sign = leg.side === "long" ? 1 : -1;
      if (leg.kind === "equity") return total + sign * leg.quantity * ql.priceStock(market.spot).value;
      if (leg.kind === "call" || leg.kind === "put") return total + sign * leg.quantity * ql.priceEuropean({ evaluationDate: market.evaluationDate, maturityDate: leg.maturityDate, spot: market.spot, strike: leg.strike, riskFreeRate: market.rate, dividendYield: market.dividend, volatility: market.volatility, type: leg.kind }).value;
      if (leg.kind === "digital") return total + sign * leg.quantity * ql.priceDigital({ evaluationDate: market.evaluationDate, maturityDate: leg.maturityDate, spot: market.spot, strike: leg.strike, riskFreeRate: market.rate, dividendYield: market.dividend, volatility: market.volatility, type: leg.optionType, cashPayoff: leg.cashPayoff }).value;
      if (leg.kind === "barrier") return total + sign * leg.quantity * ql.priceBarrier({ evaluationDate: market.evaluationDate, maturityDate: leg.maturityDate, spot: market.spot, strike: leg.strike, barrier: leg.barrier, barrierType: leg.barrierType, riskFreeRate: market.rate, dividendYield: market.dividend, volatility: market.volatility, type: leg.optionType }).value;
      if (leg.kind === "coupon") return total + sign * leg.quantity * ql.priceFixedRateBond({ evaluationDate: market.evaluationDate, issueDate: market.evaluationDate, maturityDate: leg.maturityDate, settlementDays: 0, faceAmount: leg.faceAmount, couponRate: leg.couponRate / 100, frequency: 2, flatDiscountRate: market.rate }).value;
      return total + sign * leg.quantity * ql.priceZeroCouponBond({ evaluationDate: market.evaluationDate, maturityDate: leg.maturityDate, settlementDays: 0, faceAmount: leg.faceAmount, flatDiscountRate: market.rate }).value;
    }, 0);
  }, [
    ql,
    legs,
    market.evaluationDate,
    market.dividend,
    market.volatility,
    market.spot,
    market.rate,
  ]);
  const price = () => {
    if (!ql || result) return;
    closeEditor();
    const priced = legs.map((leg) => {
      const sign = leg.side === "long" ? 1 : -1;
      if (leg.kind === "equity") {
        const r = ql.priceStock(market.spot);
        return { leg, value: sign * leg.quantity * r.value, delta: sign * leg.quantity, vega: 0, engine: "Stock" };
      }
      if (leg.kind === "call" || leg.kind === "put") {
        const r: OptionResult = ql.priceEuropean({
          evaluationDate: market.evaluationDate,
          maturityDate: leg.maturityDate,
          spot: market.spot,
          strike: leg.strike,
          riskFreeRate: market.rate,
          dividendYield: market.dividend,
          volatility: market.volatility,
          type: leg.kind,
        });
        return {
          leg,
          value: sign * leg.quantity * r.value,
          delta: sign * leg.quantity * r.delta,
          vega: sign * leg.quantity * r.vega,
          engine: "AnalyticEuropean",
        };
      }
      if (leg.kind === "digital") {
        const r = ql.priceDigital({ evaluationDate: market.evaluationDate, maturityDate: leg.maturityDate, spot: market.spot, strike: leg.strike, riskFreeRate: market.rate, dividendYield: market.dividend, volatility: market.volatility, type: leg.optionType, cashPayoff: leg.cashPayoff });
        return { leg, value: sign * leg.quantity * r.value, delta: sign * leg.quantity * r.delta, vega: sign * leg.quantity * r.vega, engine: "AnalyticEuropean" };
      }
      if (leg.kind === "barrier") {
        const r = ql.priceBarrier({ evaluationDate: market.evaluationDate, maturityDate: leg.maturityDate, spot: market.spot, strike: leg.strike, barrier: leg.barrier, barrierType: leg.barrierType, riskFreeRate: market.rate, dividendYield: market.dividend, volatility: market.volatility, type: leg.optionType });
        return { leg, value: sign * leg.quantity * r.value, delta: 0, vega: 0, engine: "AnalyticBarrier" };
      }
      const r: BondResult =
        leg.kind === "coupon"
          ? ql.priceFixedRateBond({
              evaluationDate: market.evaluationDate,
              issueDate: market.evaluationDate,
              maturityDate: leg.maturityDate,
              settlementDays: 0,
              faceAmount: leg.faceAmount,
              couponRate: leg.couponRate / 100,
              frequency: 2,
              flatDiscountRate: market.rate,
            })
          : ql.priceZeroCouponBond({
              evaluationDate: market.evaluationDate,
              maturityDate: leg.maturityDate,
              settlementDays: 0,
              faceAmount: leg.faceAmount,
              flatDiscountRate: market.rate,
            });
      return {
        leg,
        value: sign * leg.quantity * r.value,
        delta: 0,
        vega: 0,
        engine: "DiscountingBond",
      };
    });
    const total = priced.reduce((s, x) => s + x.value, 0),
      delta = priced.reduce((s, x) => s + x.delta, 0);
    const maturityAligned = legs.length > 0 && legs.every(
      (x) => x.kind === "equity" || x.maturityDate === market.maturityDate,
    );
    const minimumPayoff = maturityAligned && legs.length > 0
      ? ql.minimumBookPayoff(
          legs.map((leg) => ({
            kind: leg.kind,
            quantity: (leg.side === "long" ? 1 : -1) * leg.quantity,
            strike: leg.strike,
            call:
              leg.kind === "call" ||
              ((leg.kind === "digital" || leg.kind === "barrier") &&
                leg.optionType === "call"),
            cashPayoff: leg.cashPayoff,
            redemption: leg.faceAmount,
            rebate: 0,
          })),
        )
      : { value: 0, bounded: false };
    const protection = minimumPayoff.value;
    const hasRequiredLeg = legs.some((x) => x.kind === mission.requiredKind && x.side === "long" && x.quantity > 0);
    const positiveValue = total > 0;
    const passed =
      positiveValue &&
      protection >= mission.protection &&
      maturityAligned &&
      delta >= mission.minDelta && hasRequiredLeg;
    const budgetScore = total > 0 ? Math.max(-200, Math.min(200, Math.round((mission.budget - total) * 10))) : 0;
    const constraintScore = (protection >= mission.protection ? 100 : 0) + (delta >= mission.minDelta ? 100 : 0) + (maturityAligned ? 100 : 0) + (hasRequiredLeg ? 100 : 0);
    const timeScore = secondsLeft * 5;
    const score = passed ? budgetScore + constraintScore + timeScore : -50;
    setResult({
      delta,
      protection,
      protectionBounded: minimumPayoff.bounded,
      maturityAligned,
      hasRequiredLeg,
      passed,
      score,
    });
    onScore(score, passed, mission.title);
  };
  const priceRef = useRef(price);
  useEffect(() => {
    priceRef.current = price;
  });
  useEffect(() => {
    if (result || !ql) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0) window.setTimeout(() => priceRef.current(), 0);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ql, result, mission.id]);
  const startNextMission = () => {
    setMission((current) => randomMission(missions, current.id));
    setLegs([]); setSelected(undefined); setDraft(undefined); setResult(undefined); setSecondsLeft(ROUND_SECONDS);
  };
  const createCraftPrompt = () => {
    const book = legs.length ? legs.map((leg) => `${leg.side.toUpperCase()} ${leg.quantity.toFixed(2)}x ${leg.kind.toUpperCase()} | strike ${leg.strike} | maturity ${leg.maturityDate}`).join("\n") : "No positions were added.";
    setAiPrompt(["You are an options-structuring tutor. Explain this failed structured-product design exercise at the player's level, show the reasoning step by step, and suggest a corrected book without assuming advanced knowledge.", `PLAYER LEVEL: ${scoreboard.difficulty.toUpperCase()} (adapt the explanation and terminology to this level)`, `Mission: ${mission.title}`, `Client mandate: ${mission.client}`, "Market background:", `- Evaluation date: ${market.evaluationDate}`, `- Maturity date: ${market.maturityDate}`, `- Spot: ${market.spot}`, `- Risk-free rate: ${(market.rate * 100).toFixed(2)}%`, `- Expected return: ${(market.expectedReturn * 100).toFixed(2)}%`, `- Dividend yield: ${(market.dividend * 100).toFixed(2)}%`, `- Volatility: ${(market.volatility * 100).toFixed(1)}%`, "Requirements:", `- Protection at least EUR ${mission.protection.toFixed(2)}`, `- Delta at least ${mission.minDelta.toFixed(2)}`, `- ${mission.requiredLabel}`, `- Budget benchmark: EUR ${mission.budget.toFixed(2)}`, "My submitted book:", book, "Observed result:", `- Protection: ${result?.protection.toFixed(2) ?? "not calculated"}`, `- Delta: ${result?.delta.toFixed(3) ?? "not calculated"}`, `- Maturity aligned: ${result?.maturityAligned ? "yes" : "no"}`, `- Required leg present: ${result?.hasRequiredLeg ? "yes" : "no"}`, "Please identify exactly why the mandate failed, explain each missed constraint, and propose the smallest practical correction."] .join("\n"));
  };
  return (
    <section className="mode-view game-page craft-page">
      <button className="back-home" onClick={onBack}><span aria-hidden="true">←</span> BACK TO HOME</button>
      <GameScoreboard scoreboard={scoreboard} mode="craft" />
      <section className="mode-header mission-header">
        <div>
          <p className="eyebrow">CRAFT SPRINT · {mission.id}</p>
          <h1>{mission.title}</h1>
        </div>
        <RoundTimer label={result ? "ROUND CLOSED" : "TIME LEFT"} value={`${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`} progress={secondsLeft / ROUND_SECONDS * 100} urgent={secondsLeft <= 10} />
      </section>
      <section className="game-context-grid">
        <article className="game-context-card question-context">
          <p className="panel-label">CLIENT MANDATE</p>
          <p className="mission-copy">{mission.client}</p>
          <div className="mission-rules">
            <span>Protection ≥ €{money(mission.protection)}</span>
            <span>Delta ≥ {mission.minDelta.toFixed(2)}</span>
            <span>{mission.requiredLabel}</span>
          </div>
        </article>
        <article className="game-context-card market-context">
          <p className="panel-label">CURRENT MARKET</p>
          <div className="market-snapshot">
            <span>POINT<strong>{market.evaluationDate}</strong></span>
            <span>MATURITY<strong>{market.maturityDate}</strong></span>
            <span>RFR<strong>{(market.rate * 100).toFixed(2)}%</strong></span>
            <span>EXPECTED RETURN<strong>{(market.expectedReturn * 100).toFixed(2)}%</strong></span>
            <span>DIVIDEND<strong>{(market.dividend * 100).toFixed(2)}%</strong></span>
            <span>VOL<strong>{(market.volatility * 100).toFixed(1)}%</strong></span>
          </div>
        </article>
      </section>
      <section className="craft-layout">
        <aside className="ingredient-panel">
          <div className="panel-label">
            <span>INSTRUMENTS</span>
          </div>
          <div className="ingredient-list">
            {ingredients.map((i) => (
              <button
                key={i.id}
                className={`ingredient-card ${i.color}`}
                onClick={() => add(i.id)}
              >
                <span className="ingredient-symbol">{i.symbol}</span>
                <span>
                  <strong>{i.label}</strong>
                  <small>{i.detail}</small>
                </span>
                <em>+</em>
              </button>
            ))}
          </div>
        </aside>
        <div className="builder-column">
          <div className="builder-toolbar">
            <span>YOUR MACHINE · {legs.length} LEGS</span>
          </div>
          <div className="budget-meter">
            <div><span>BUDGET BENCHMARK</span><strong>€{money(mission.budget)}</strong></div>
            <div><span>USED NOW</span><strong>€{money(liveCost)}</strong></div>
            <div className={mission.budget - liveCost < 0 ? "over" : "remaining"}><span>{mission.budget - liveCost >= 0 ? "AVAILABLE" : "OVER BUDGET"}</span><strong>{mission.budget - liveCost >= 0 ? "+" : "−"}€{money(Math.abs(mission.budget - liveCost))}</strong></div>
            <div className="budget-track"><i style={{ width: `${Math.min(100, Math.max(0, liveCost / mission.budget * 100))}%` }} /></div>
          </div>
          <div className="builder-stage leg-stage">
            {!legs.length ? (
              <div className="drop-zone">
                <div className="drop-plus">+</div>
                <strong>Add your first position</strong>
              </div>
            ) : (
              <div className="leg-list">
                {legs.map((leg, n) => {
                  const i = ingredients.find((x) => x.id === leg.kind)!;
                  return (
                    <div
                      className={`position-card ${i.color} ${leg.uid === selected ? "active" : ""}`}
                      key={leg.uid}
                      style={{ "--order": n } as React.CSSProperties}
                    >
                      <button className="position-open" onClick={() => setSelected(leg.uid)}>
                        <span className={`side-badge ${leg.side}`}>{leg.side}</span>
                        <span className="ingredient-symbol">{i.symbol}</span>
                        <span>
                          <strong>{i.label}</strong>
                          <small>
                            {leg.quantity.toFixed(2)}×
                            {leg.kind === "equity"
                              ? ` · Spot ${market.spot}`
                              : leg.kind === "call" || leg.kind === "put" || leg.kind === "digital" || leg.kind === "barrier"
                              ? ` · K ${leg.strike}`
                              : leg.kind === "coupon"
                                ? ` · €${money(leg.faceAmount)} face · ${leg.couponRate}% coupon`
                                : ` · €${money(leg.faceAmount)} face`} · {leg.maturityDate}
                          </small>
                        </span>
                        <b>EDIT ›</b>
                      </button>
                      <button className="quick-remove" onClick={() => remove(leg.uid)} aria-label={`Remove ${i.label}`} title="Remove instrument">×</button>
                    </div>
                  );
                })}
              </div>
            )}
            {active && (<>
              <div className="leg-editor-backdrop" aria-hidden="true" />
              <div className="leg-editor" role="dialog" aria-modal="true" aria-labelledby="leg-editor-title">
                <div className="editor-head">
                  <div>
                    <small>{draft ? "NEW LEG" : "EDIT LEG"}</small>
                    <strong id="leg-editor-title">
                      {ingredients.find((x) => x.id === active.kind)?.label}
                    </strong>
                  </div>
                  <button autoFocus onClick={closeEditor} aria-label="Close leg editor">×</button>
                </div>
                <div className="side-switch">
                  <button
                    className={active.side === "long" ? "active long" : ""}
                    onClick={() => update(active.uid, { side: "long" })}
                  >
                    LONG
                  </button>
                  <button
                    className={active.side === "short" ? "active short" : ""}
                    onClick={() => update(active.uid, { side: "short" })}
                  >
                    SHORT
                  </button>
                </div>
                <Slider
                  label="Position"
                  value={active.quantity}
                  min={0.1}
                  max={2}
                  step={0.1}
                  suffix="×"
                  onChange={(quantity) => update(active.uid, { quantity })}
                />
                {(active.kind === "call" || active.kind === "put" || active.kind === "digital" || active.kind === "barrier") && (
                  <Slider
                    label="Strike"
                    value={active.strike}
                    min={Math.round(market.spot * .6)}
                    max={Math.round(market.spot * 1.4)}
                    step={1}
                    suffix=""
                    onChange={(strike) => update(active.uid, { strike })}
                  />
                )}
                {(active.kind === "digital" || active.kind === "barrier") && (
                  <div className="option-switch">
                    <button className={active.optionType === "call" ? "active" : ""} onClick={() => update(active.uid, { optionType: "call" })}>CALL</button>
                    <button className={active.optionType === "put" ? "active" : ""} onClick={() => update(active.uid, { optionType: "put" })}>PUT</button>
                  </div>
                )}
                {active.kind === "digital" && (
                  <Slider label="Cash payoff" value={active.cashPayoff} min={1} max={100} step={1} suffix="" onChange={(cashPayoff) => update(active.uid, { cashPayoff })} />
                )}
                {active.kind === "barrier" && (<>
                  <Slider label="Barrier level" value={active.barrier} min={Math.round(market.spot * .5)} max={Math.round(market.spot * 1.5)} step={1} suffix="" onChange={(barrier) => update(active.uid, { barrier })} />
                  <label className="date-field"><span>Barrier type</span><select value={active.barrierType} onChange={(event) => update(active.uid, { barrierType: event.target.value as CraftLeg["barrierType"] })}><option value="down-in">Down & In</option><option value="down-out">Down & Out</option><option value="up-in">Up & In</option><option value="up-out">Up & Out</option></select></label>
                </>)}
                {active.kind === "coupon" && (
                  <Slider
                    label="Coupon"
                    value={active.couponRate}
                    min={0}
                    max={12}
                    step={0.25}
                    suffix="%"
                    onChange={(couponRate) =>
                      update(active.uid, { couponRate })
                    }
                  />
                )}
                {(active.kind === "bond" || active.kind === "coupon") && (
                  <Slider
                    label="Face value"
                    value={active.faceAmount}
                    min={10}
                    max={200}
                    step={5}
                    suffix=""
                    onChange={(faceAmount) =>
                      update(active.uid, { faceAmount })
                    }
                  />
                )}
                {active.kind !== "equity" && <label className="date-field">
                  <span>Maturity date</span>
                  <input
                    type="date"
                    min="2025-01-03"
                    max="2035-12-31"
                    value={active.maturityDate}
                    onChange={(event) =>
                      update(active.uid, { maturityDate: event.target.value })
                    }
                  />
                </label>}
                <div className="instrument-quote">
                  <div>
                    <span>FAIR VALUE</span>
                    <strong>{activeQuote ? money(activeQuote.unit) : "—"}</strong>
                    <small>per instrument</small>
                  </div>
                  <div>
                    <span>POSITION VALUE</span>
                    <strong>
                      {activeQuote
                        ? `${activeQuote.position >= 0 ? "+" : "−"}${money(Math.abs(activeQuote.position))}`
                        : "—"}
                    </strong>
                    <small>
                      {active.side} {active.quantity.toFixed(2)}×
                    </small>
                  </div>
                </div>
                {active.kind === "equity" && activeQuote?.distribution && (
                  <div className="equity-outlook">
                    <span>MARKET GBM · μ {(market.expectedReturn * 100).toFixed(2)}% · TO {market.maturityDate}</span>
                    <div>
                      <strong>↑ {(activeQuote.marketDistribution.upProbability * 100).toFixed(1)}%</strong>
                      <strong>↓ {(activeQuote.marketDistribution.downProbability * 100).toFixed(1)}%</strong>
                      <strong>MEAN {money(activeQuote.marketDistribution.forward)}</strong>
                    </div>
                  </div>
                )}
                <div className="leg-editor-actions">
                  {draft
                    ? <button className="editor-secondary" onClick={closeEditor}>CANCEL</button>
                    : <button className="remove-leg" onClick={() => remove(active.uid)}>REMOVE LEG</button>}
                  <button className="editor-primary" onClick={draft ? commitDraft : closeEditor}>{draft ? "ADD LEG" : "DONE"}</button>
                </div>
              </div>
            </>)}
          </div>
          <div className="chart-card">
            <div className="chart-head">
              <div>
                <span className="panel-label">MISSION CHECK</span>
              </div>
            </div>
            <div className="constraint-grid">
              <div className={result && result.protection >= mission.protection ? "pass" : ""}>
                <span>PROTECTION</span>
                <strong>
                  {result
                    ? result.protectionBounded
                      ? `€${money(result.protection)}`
                      : "−∞"
                    : "???"}
                </strong>
                <small>≥ €{money(mission.protection)}</small>
              </div>
              <div className={result && result.delta >= mission.minDelta ? "pass" : ""}>
                <span>UPSIDE</span>
                <strong>{result ? result.delta.toFixed(3) : "???"}</strong>
                <small>≥ {mission.minDelta.toFixed(2)} delta</small>
              </div>
              <div className={result?.maturityAligned ? "pass" : ""}>
                <span>MATURITY</span>
                <strong>{result?.maturityAligned ? "MATCH" : result ? "MISMATCH" : "???"}</strong>
                <small>{market.maturityDate}</small>
              </div>
              <div className={result?.hasRequiredLeg ? "pass" : ""}>
                <span>REQUIRED LEG</span>
                <strong>{result?.hasRequiredLeg ? "IN BOOK" : result ? "MISSING" : "???"}</strong>
                <small>{mission.requiredLabel}</small>
              </div>
            </div>
          </div>
          {!result && <div className="action-row submit-only">
            <button
              className="primary-action game-primary"
              disabled={!legs.length || !ql}
              onClick={price}
            >
              {ql ? "FINISH ROUND" : "PREPARING…"} <span>→</span>
            </button>
          </div>}
        </div>
      </section>
      {result && <><RoundResult passed={result.passed} status={result.passed ? "MANDATE PASSED" : scoreboard.difficulty === "intern" ? "CLIENT CONSTRAINTS MISSED" : "CLIENT CONSTRAINTS MISSED · −1 LIFE"} score={result.score} actionLabel="NEXT MISSION" onNext={startNextMission} onAskAI={createCraftPrompt} />{aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}</>}
    </section>
  );
}
