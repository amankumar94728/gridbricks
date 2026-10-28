// Chart colours and axis styling shared by every view.

export const COLORS = {
  actual: "#2563eb",
  forecast: "#0d9488",
  corrected: "#7c3aed",
  band: "#14b8a6",
  bias: "#f97316",
  under: "#3b82f6",
  grid: "#e9eef5",
  axis: "#94a3b8",
  muted: "#cbd5e1",
};

/** Shared Recharts axis styling. */
export const axisProps = {
  stroke: COLORS.axis,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;
