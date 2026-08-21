import type { ReactNode } from "react";

export type PositionLeg = {
  side: "long" | "short";
  text: string;
};

/**
 * The position card: label, title, optional description, and the leg list
 * (each leg with a LONG/SHORT badge).
 */
export function PositionBook({
  label,
  title,
  description,
  legs,
}: {
  label: string;
  title?: ReactNode;
  description?: ReactNode;
  legs: PositionLeg[];
}) {
  return (
    <article className="position-book">
      <small>{label}</small>
      {title && <h2>{title}</h2>}
      {description && <p>{description}</p>}
      <div className="position-legs">
        {legs.map((leg, index) => (
          <div key={index}>
            <b className={leg.side}>{leg.side === "long" ? "LONG" : "SHORT"}</b>
            <span>{leg.text}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
