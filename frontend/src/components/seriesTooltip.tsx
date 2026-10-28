import type { ReactNode } from "react";
import { TooltipCard } from "./ui";

/**
 * Generic Recharts tooltip: one row per series, formatted with `format`.
 * Use as `<Tooltip content={seriesTooltip(fmt, labelFmt)} />`.
 */
export function seriesTooltip(format: (v: number) => string, formatLabel: (label: unknown) => ReactNode) {
  return function SeriesTooltip({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: readonly { name?: unknown; value?: unknown; color?: string }[];
    label?: unknown;
  }) {
    if (!active || !payload?.length) return null;
    return (
      <TooltipCard
        title={formatLabel(label)}
        rows={payload
          .filter((p) => typeof p.value === "number")
          .map((p) => ({ label: String(p.name), value: format(p.value as number), color: p.color }))}
      />
    );
  };
}
