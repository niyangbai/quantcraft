import type { ReactNode } from "react";

export type Metric = {
  label: string;
  value: ReactNode;
  tone?: "positive" | "negative" | "flat";
};

/**
 * The scenario card: a labelled title, an optional description, optional
 * extra blocks (e.g. the dealer objective), and a row of metrics.
 */
export function ScenarioCard({
  label,
  title,
  description,
  metrics,
  largeTitle = false,
  children,
}: {
  label: string;
  title: ReactNode;
  description?: ReactNode;
  metrics: Metric[];
  largeTitle?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`scenario-card${largeTitle ? " large-title" : ""}`}>
      <small>{label}</small>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {children}
      <div className="metric-grid">
        {metrics.map((metric) => (
          <span key={metric.label}>
            <small>{metric.label}</small>
            <strong className={metric.tone ? `tone-${metric.tone}` : undefined}>{metric.value}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}
