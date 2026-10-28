// All times are shown in UK local time: that is the clock the trading desk works to.
const UK = "Europe/London";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK, weekday: "short", day: "numeric", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

/** "2026-01-15" -> "Thu 15 Jan" (the string is a calendar day, not an instant). */
export const fmtDay = (day: string) => dayFmt.format(new Date(`${day}T12:00:00Z`));

export const fmtMw = (mw: number | null | undefined) =>
  mw == null ? "–" : `${Math.round(mw).toLocaleString("en-GB")} MW`;

export const fmtGw = (mw: number | null | undefined, digits = 2) =>
  mw == null ? "–" : `${(mw / 1000).toFixed(digits)} GW`;

export const fmtSignedGw = (mw: number | null | undefined, digits = 2) =>
  mw == null ? "–" : `${mw > 0 ? "+" : mw < 0 ? "−" : ""}${Math.abs(mw / 1000).toFixed(digits)} GW`;

export const fmtGwh = (mwh: number | null | undefined) =>
  mwh == null ? "–" : `${(mwh / 1000).toLocaleString("en-GB", { maximumFractionDigits: 0 })} GWh`;

export const fmtPct = (v: number | null | undefined, digits = 0) => (v == null ? "–" : `${v.toFixed(digits)}%`);

export const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)}h`;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Axis label for an MW value, in GW. */
export const gwAxis = (mw: number) => `${Number((mw / 1000).toFixed(1))} GW`;

export const pad2 = (n: number) => String(n).padStart(2, "0");
