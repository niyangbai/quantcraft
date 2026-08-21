import type { ReactNode } from "react";

export type RevealCell = {
  label: string;
  value: ReactNode;
  tone?: "positive" | "negative";
};

/**
 * Result strip shown after a round settles: a row of labelled values
 * plus an optional explanatory note in the last cell.
 */
export function RevealBar({
  cells,
  note,
}: {
  cells: RevealCell[];
  note?: ReactNode;
}) {
  return (
    <div className="reveal-grid">
      {cells.map((cell) => (
        <div key={cell.label}>
          <span>{cell.label}</span>
          <strong className={cell.tone ? `tone-${cell.tone}` : undefined}>{cell.value}</strong>
        </div>
      ))}
      {note && <p>{note}</p>}
    </div>
  );
}
