import type { ReactNode } from "react";

export type ChoiceItem = {
  key: string;
  label: ReactNode;
  detail?: ReactNode;
  /** Span the full grid row (e.g. "DO NOTHING"). */
  wide?: boolean;
  /** Direction tint for directional drills (e.g. Greek). */
  tone?: "down" | "flat" | "up";
};

/**
 * Reusable answer grid.
 *
 * Two reveal modes:
 *  - flash (answerIndex set): after `revealed`, the correct index turns
 *    green and a wrongly selected index turns red;
 *  - multi (answerIndex omitted): selected indices keep the "selected"
 *    highlight (used by multi-tool hedges).
 */
export function ChoiceGrid({
  items,
  selected,
  revealed,
  answerIndex,
  onToggle,
  note,
  columns = 2,
  large = false,
}: {
  items: ChoiceItem[];
  selected: number[];
  revealed: boolean;
  answerIndex?: number;
  onToggle: (index: number) => void;
  note?: ReactNode;
  columns?: 2 | 3;
  large?: boolean;
}) {
  const gridClass = [
    "choice-grid",
    columns === 3 ? "cols-3" : "",
    large ? "large" : "",
  ].filter(Boolean).join(" ");
  return (
    <div>
      {note && <p className="choice-note">{note}</p>}
      <div className={gridClass}>
        {items.map((item, index) => {
          const isSelected = selected.includes(index);
          const isCorrect = revealed && answerIndex !== undefined && index === answerIndex;
          const isWrong = revealed && answerIndex !== undefined && index !== answerIndex && isSelected;
          const className = [
            revealed && answerIndex !== undefined ? (isCorrect ? "correct" : isWrong ? "wrong" : "") : isSelected ? "selected" : "",
            item.wide ? "wide" : "",
            item.tone ? `tone-${item.tone}` : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={item.key} className={className} disabled={revealed} onClick={() => onToggle(index)}>
              <strong>{item.label}</strong>
              {item.detail && <small>{item.detail}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
