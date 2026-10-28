import type { ReactNode } from "react";
import { useIsMobile } from "../hooks";
import { IconAlert } from "./icons";

export function PageIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page-intro">
      <h2>{title}</h2>
      <div className="page-intro-body">{children}</div>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Tone = "neutral" | "teal" | "violet" | "orange" | "blue" | "green";

export function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={`kpi tone-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="kpis">{children}</div>;
}

export function Field({ label, children, grow }: { label: ReactNode; children: ReactNode; grow?: boolean }) {
  return (
    <label className={grow ? "field field-grow" : "field"}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { color: string; label: string; dashed?: boolean; area?: boolean }[];
}) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label}>
          <span
            className={i.area ? "swatch swatch-area" : i.dashed ? "swatch swatch-dashed" : "swatch"}
            style={{ borderColor: i.color, background: i.area ? `${i.color}2e` : undefined }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Chart container whose height adapts to the viewport. */
export function ChartBox({
  height,
  children,
}: {
  height: [mobile: number, desktop: number];
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  return (
    <div className="chart" style={{ height: mobile ? height[0] : height[1] }}>
      {children}
    </div>
  );
}

export interface TooltipRow {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

export function TooltipCard({
  title,
  rows,
  note,
}: {
  title: ReactNode;
  rows: TooltipRow[];
  note?: ReactNode;
}) {
  return (
    <div className="tooltip">
      <div className="tooltip-title">{title}</div>
      {rows.map((r, i) => (
        <div className="tooltip-row" key={i}>
          <span>
            {r.color && <i style={{ background: r.color }} />}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
      {note && <div className="tooltip-note">{note}</div>}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} />;
}

export function LoadingPage() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <Skeleton height={22} width="45%" />
      <div className="kpis">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={108} />
        ))}
      </div>
      <Skeleton height={380} />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <IconAlert size={20} />
      <div>
        <strong>Could not load data</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function LoadingBar({ active }: { active: boolean }) {
  return <div className={active ? "loading-bar active" : "loading-bar"} aria-hidden="true" />;
}
