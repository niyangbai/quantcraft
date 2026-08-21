import { useEffect, useMemo, useState } from "react";
import { bestAsk, bestBid, spread } from "@quantcraft/finmath";
import type { OrderBook as Book } from "@quantcraft/finmath";
import { AiPromptModal, RoundResult, RoundTimer } from "../../ui";
import { secureSeed, seededRandom } from "../../game";
import type { Scoreboard } from "../../game";
import { applyEvent, buildOrderbookPrompt, formatPrice, generateInitialBook, generateQuestion, isBookHealthy } from "./game";
import type { OrderBookSeed, OrderbookQuestion } from "./game";
import { ChoiceGrid, GameFrame, OrderBookCard, RevealBar, ScenarioCard } from "../../ui";

export function OrderBook({
  seeds,
  onScore,
  onBack,
  scoreboard,
}: {
  seeds: OrderBookSeed[];
  onScore: (score: number, correct: boolean, streak: number, label: string) => void;
  onBack: () => void;
  scoreboard: Scoreboard;
}) {
  const [initial] = useState(() => generateInitialBook(seededRandom(secureSeed()), seeds));
  const [book, setBook] = useState<Book>(initial.book);
  const [seed, setSeed] = useState<OrderBookSeed>(initial.seed);
  const [bookIndex, setBookIndex] = useState(0);
  const [roundKey, setRoundKey] = useState(secureSeed);
  const [round, setRound] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "timeout">();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [lastScore, setLastScore] = useState(0);
  const [aiPrompt, setAiPrompt] = useState<string>();

  const duration = Math.max(4000, 10000 - scoreboard.streak * 450);
  const question = useMemo<OrderbookQuestion | undefined>(() => {
    const rng = seededRandom(roundKey);
    return generateQuestion(rng, book, seed);
  }, [roundKey, book, seed]);

  const next = () => {
    if (!question) return;
    const updated = applyEvent(book, question.event);
    if (isBookHealthy(updated)) {
      setBook(updated);
    } else {
      const fresh = generateInitialBook(seededRandom(secureSeed()), seeds);
      setBook(fresh.book);
      setSeed(fresh.seed);
      setBookIndex((value) => value + 1);
    }
    setRoundKey(secureSeed());
    setRound((value) => value + 1);
    setAnswered(false);
    setFeedback(undefined);
    setSelectedIndex(undefined);
    setAiPrompt(undefined);
  };

  const submit = (index: number) => {
    if (!question || answered) return;
    const correct = index === question.answerIndex;
    const nextStreak = correct ? scoreboard.streak + 1 : 0;
    const points = correct ? 100 + scoreboard.streak * 10 : -50;
    setAnswered(true);
    setFeedback(correct ? "correct" : "wrong");
    setSelectedIndex(index);
    setLastScore(points);
    onScore(points, correct, nextStreak, `${question.questionText} · ${question.seed.label}`);
  };

  useEffect(() => {
    if (!question || answered) return;
    const timer = window.setTimeout(() => {
      setAnswered(true);
      setFeedback("timeout");
      setSelectedIndex(undefined);
      setLastScore(-50);
      onScore(-50, false, 0, `${question.questionText} · Time out`);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [question, answered, duration, onScore]);

  if (!question) return <GameFrame mode="orderbook" eyebrow="ORDER BOOK" title="Read the book." onBack={onBack} scoreboard={scoreboard}><div className="drop-zone">Preparing order book…</div></GameFrame>;

  const displayedBook = answered ? question.result.book : question.book;
  const hitPrices = new Set(question.result.fills.map((fill) => fill.price));
  const rows = (levels: { price: number; size: number }[]) => levels.map((level) => ({
    price: formatPrice(level.price),
    size: level.size,
    hit: hitPrices.has(level.price),
  }));
  const currentSpread = spread(displayedBook);
  const eventText = `MARKET ${question.event.side.toUpperCase()} ${question.event.size}`;
  const hitSideLabel = question.event.side === "buy" ? "ask" : "bid";

  return (
    <GameFrame
      mode="orderbook"
      eyebrow={`ORDER BOOK · FLASH ROUND · ROUND ${round + 1} · BOOK ${bookIndex + 1}`}
      title="Read the book."
      intro="A market order walks the ladder in price-time priority. Call what happens to the book."
      onBack={onBack}
      scoreboard={scoreboard}
      tools={<RoundTimer label="DECISION WINDOW" value={`${(duration / 1000).toFixed(0)}s`} durationMs={duration} resetKey={roundKey} />}
    >
      <ScenarioCard
        label={`EVENT · ${question.questionText}`}
        title={eventText}
        description={`A market ${question.event.side} of ${question.event.size} consumes the best ${hitSideLabel}s first, in price-time priority.`}
        metrics={[
          { label: "BEST BID", value: formatPrice(bestBid(displayedBook) ?? 0) },
          { label: "BEST ASK", value: formatPrice(bestAsk(displayedBook) ?? 0) },
          { label: "SPREAD", value: currentSpread !== undefined ? formatPrice(currentSpread) : "—" },
        ]}
      />
      <div className="game-layout">
        <OrderBookCard
          asks={rows(displayedBook.asks)}
          bids={rows(displayedBook.bids)}
          spreadLabel={currentSpread !== undefined ? formatPrice(currentSpread) : "—"}
        />
        <article className="game-panel">
          <h2>{question.questionText}</h2>
          <ChoiceGrid
            note={eventText}
            items={question.choices.map((choice, index) => ({ key: `${choice.label}-${index}`, label: choice.label }))}
            selected={selectedIndex !== undefined ? [selectedIndex] : []}
            revealed={answered}
            answerIndex={question.answerIndex}
            onToggle={(index) => submit(index)}
            large
          />
        </article>
      </div>
      {answered && (
        <RevealBar
          cells={[
            { label: "RESULT", value: feedback === "correct" ? "CORRECT" : feedback === "timeout" ? "TIME'S UP" : "WRONG", tone: feedback === "correct" ? "positive" : "negative" },
            { label: "ANSWER", value: question.answerText },
          ]}
          note={question.explanation}
        />
      )}
      {answered && (
        <RoundResult
          passed={feedback === "correct"}
          status={feedback === "correct"
            ? "BOOK READ"
            : feedback === "timeout"
              ? "DECISION WINDOW CLOSED"
              : scoreboard.difficulty === "intern" ? "WRONG READ" : "WRONG READ · −1 LIFE"}
          score={lastScore}
          actionLabel="NEXT ORDER"
          onNext={next}
          onAskAI={feedback === "correct" ? undefined : () => setAiPrompt(buildOrderbookPrompt(question, scoreboard.difficulty))}
        />
      )}
      {aiPrompt && <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(undefined)} />}
    </GameFrame>
  );
}

