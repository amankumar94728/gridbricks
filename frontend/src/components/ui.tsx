import type { ReactNode } from "react";

export const COLORS = {
  actual: "#1d4ed8",
  forecast: "#059669",
  corrected: "#7c3aed",
  band: "#10b981",
  bias: "#ea580c",
  grid: "#e2e8f0",
  axis: "#64748b",
  muted: "#94a3b8",
};

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-head">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "warn" | "accent";
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <div className="status status-error">Could not load data: {error}</div>;
  if (loading) return <div className="status">Loading…</div>;
  return null;
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean; area?: boolean }[] }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label}>
          <span
            className={i.area ? "swatch swatch-area" : i.dashed ? "swatch swatch-dashed" : "swatch"}
            style={{ borderColor: i.color, background: i.area ? `${i.color}33` : undefined }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
