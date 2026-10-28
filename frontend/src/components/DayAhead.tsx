import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiUrl, useApi, type DayAhead as DayAheadData, type Meta, type Point } from "../api";
import {
  addDays,
  daysBetween,
  fmtDateTime,
  fmtDay,
  fmtGw,
  fmtGwh,
  fmtHours,
  fmtMw,
  fmtSignedGw,
  fmtTime,
  gwAxis,
} from "../format";
import { useIsMobile } from "../hooks";
import {
  IconBolt,
  IconChevron,
  IconClock,
  IconEye,
  IconShield,
  IconTarget,
  IconTrend,
  IconWind,
} from "./icons";
import {
  Card,
  ChartBox,
  ErrorState,
  Field,
  Kpi,
  KpiGrid,
  Legend,
  LoadingBar,
  LoadingPage,
  PageIntro,
  TooltipCard,
} from "./ui";
import { axisProps, COLORS } from "../theme";

interface Props {
  meta: Meta;
  decisionHour: number;
  lookbackDays: number;
}

type Row = Point & { band?: [number, number] };

export function DayAhead({ meta, decisionHour, lookbackDays }: Props) {
  const days = useMemo(() => daysBetween(meta.deliveryFirst, meta.deliveryLast), [meta]);
  const [day, setDay] = useState("2026-01-15");
  const [showActual, setShowActual] = useState(true);
  const mobile = useIsMobile();

  const { data, error, loading, reload } = useApi<DayAheadData>(
    apiUrl("day-ahead", { delivery_day: day, decision_hour: decisionHour, lookback_days: lookbackDays }),
  );

  const rows: Row[] = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        ...p,
        band: p.firm != null && p.upside != null ? [p.firm, p.upside] : undefined,
      })),
    [data],
  );

  const idx = days.indexOf(day);

  return (
    <div className="stack">
      <PageIntro title="Day-ahead view">
        What the desk could see when buying for a delivery day, and how much of that wind it could rely on.
      </PageIntro>

      <div className="toolbar card">
        <Field label="Delivery day">
          <div className="day-picker">
            <button
              type="button"
              className="icon-btn"
              disabled={idx <= 0}
              onClick={() => setDay(addDays(day, -1))}
              aria-label="Previous day"
            >
              <IconChevron dir="left" />
            </button>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)} 2026
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              disabled={idx >= days.length - 1}
              onClick={() => setDay(addDays(day, 1))}
              aria-label="Next day"
            >
              <IconChevron />
            </button>
          </div>
        </Field>
        <button
          type="button"
          role="switch"
          aria-checked={showActual}
          className={showActual ? "switch on" : "switch"}
          onClick={() => setShowActual((v) => !v)}
        >
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
          <IconEye off={!showActual} size={16} />
          {showActual ? "Actual outturn shown" : "Actual outturn hidden"}
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingPage />}

      {data && (
        <>
          <LoadingBar active={loading} />
          <Timeline data={data} rows={rows} />

          <KpiGrid>
            <Kpi
              label="Forecast wind"
              value={fmtGwh(data.energy.forecastMwh)}
              hint="Raw Elexon forecast for the day"
              icon={<IconWind />}
              tone="teal"
            />
            <Kpi
              label="Bias-adjusted"
              value={fmtGwh(sum(rows, "corrected"))}
              hint={data.profile ? `Recent bias ${fmtSignedGw(data.profile.bias)} removed` : "No history yet"}
              icon={<IconTrend />}
              tone="violet"
            />
            <Kpi
              label="Firm wind (P90)"
              value={fmtGwh(sum(rows, "firm"))}
              hint="Level wind beats ~9 hours in 10"
              icon={<IconShield />}
              tone="green"
            />
            {showActual ? (
              <Kpi
                label="Actual wind"
                value={fmtGwh(data.energy.actualMwh)}
                hint={
                  <>
                    MAE {fmtGw(data.stats?.mae)} raw · {fmtGw(data.correctedStats?.mae)} adjusted
                  </>
                }
                icon={<IconTarget />}
                tone="blue"
              />
            ) : (
              <Kpi
                label="Actual wind"
                value="Hidden"
                hint="Reveal to compare with outturn"
                icon={<IconTarget />}
              />
            )}
          </KpiGrid>

          <Card
            title="Wind generation across the delivery day"
            subtitle="Hourly forecast as it stood at the decision time, with half-hourly metered outturn."
          >
            <Legend
              items={[
                { color: COLORS.forecast, label: "Forecast at decision" },
                { color: COLORS.corrected, label: "Bias-adjusted", dashed: true },
                { color: COLORS.band, label: "Expected range (P10–P90)", area: true },
                ...(showActual ? [{ color: COLORS.actual, label: "Actual" }] : []),
              ]}
            />
            <ChartBox height={[280, 400]}>
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="band-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={COLORS.band} stopOpacity={0.28} />
                      <stop offset="1" stopColor={COLORS.band} stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={fmtTime}
                    ticks={rows.filter((_, i) => i % (mobile ? 12 : 6) === 0).map((r) => r.time)}
                    {...axisProps}
                  />
                  <YAxis tickFormatter={gwAxis} {...axisProps} width={60} />
                  <Tooltip
                    content={(p) => (
                      <DayTooltip active={p.active} payload={p.payload} showActual={showActual} />
                    )}
                    cursor={{ stroke: COLORS.axis, strokeDasharray: "3 3" }}
                  />
                  <Area
                    dataKey="band"
                    stroke="none"
                    fill="url(#band-fill)"
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="forecast"
                    stroke={COLORS.forecast}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="corrected"
                    stroke={COLORS.corrected}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  {showActual && (
                    <Line
                      dataKey="actual"
                      stroke={COLORS.actual}
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </ChartBox>
            <p className="footnote">
              The range and firm level are learned from forecast errors the desk had already seen before the
              decision. Nothing published after the decision time is used.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function sum(rows: Row[], key: "corrected" | "firm"): number | null {
  const values = rows.filter((r) => r[key] != null).map((r) => r[key]!);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

/** Forecast published → decision → delivery, so the timing is obvious at a glance. */
function Timeline({ data, rows }: { data: DayAheadData; rows: Row[] }) {
  const horizons = rows.filter((r) => r.horizonH != null).map((r) => r.horizonH!);
  const published = data.forecastPublishTimes.at(-1);
  return (
    <ol className="timeline" aria-label="Decision timeline">
      <li>
        <span className="timeline-icon">
          <IconWind size={16} />
        </span>
        <div>
          <small>Latest forecast published</small>
          <strong>{published ? fmtDateTime(published) : "None available"}</strong>
        </div>
      </li>
      <li className="timeline-key">
        <span className="timeline-icon">
          <IconClock size={16} />
        </span>
        <div>
          <small>Purchase decision</small>
          <strong>{fmtDateTime(data.decisionTime)}</strong>
        </div>
      </li>
      <li>
        <span className="timeline-icon">
          <IconBolt size={16} />
        </span>
        <div>
          <small>Delivery</small>
          <strong>{fmtDay(data.deliveryDay)}, 00:00–24:00</strong>
          {horizons.length > 0 && (
            <em>
              {fmtHours(Math.min(...horizons))}–{fmtHours(Math.max(...horizons))} ahead of forecast
            </em>
          )}
        </div>
      </li>
    </ol>
  );
}

function DayTooltip({
  active,
  payload,
  showActual,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  showActual: boolean;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as Row;
  const rows = [];
  if (r.forecast != null) {
    rows.push({ label: "Forecast", value: fmtMw(r.forecast), color: COLORS.forecast });
    if (r.corrected != null)
      rows.push({ label: "Bias-adjusted", value: fmtMw(r.corrected), color: COLORS.corrected });
    if (r.firm != null)
      rows.push({ label: "Range", value: `${fmtMw(r.firm)} – ${fmtMw(r.upside)}`, color: COLORS.band });
  }
  if (showActual) {
    rows.push({ label: "Actual", value: fmtMw(r.actual), color: COLORS.actual });
    if (r.error != null) rows.push({ label: "Error", value: fmtSignedGw(r.error) });
  }
  return (
    <TooltipCard
      title={fmtDateTime(r.time)}
      rows={rows}
      note={r.horizonH != null ? `Forecast made ${fmtHours(r.horizonH)} ahead` : undefined}
    />
  );
}
