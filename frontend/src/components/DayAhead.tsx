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
import type { TooltipContentProps } from "recharts";
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
import { COLORS, Card, Field, Kpi, Legend, Status } from "./ui";

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

  const { data, error, loading } = useApi<DayAheadData>(
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

  const hourly = rows.filter((r) => r.forecast != null);
  const firmMwh = hourly.length ? hourly.reduce((s, r) => s + (r.firm ?? 0), 0) : null;
  const correctedMwh = hourly.length ? hourly.reduce((s, r) => s + (r.corrected ?? 0), 0) : null;
  const horizons = hourly.map((r) => r.horizonH ?? 0);
  const idx = days.indexOf(day);

  return (
    <div className="stack">
      <div className="toolbar">
        <Field label="Delivery day">
          <div className="day-picker">
            <button disabled={idx <= 0} onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
              ‹
            </button>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)}
                </option>
              ))}
            </select>
            <button
              disabled={idx >= days.length - 1}
              onClick={() => setDay(addDays(day, 1))}
              aria-label="Next day"
            >
              ›
            </button>
          </div>
        </Field>
        <label className="toggle">
          <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />
          Reveal actual outturn
        </label>
        <Status loading={loading && !data} error={error} />
      </div>

      {data && (
        <>
          <p className="lede">
            Buying for <strong>{fmtDay(data.deliveryDay)}</strong> at{" "}
            <strong>{fmtDateTime(data.decisionTime)}</strong>, the latest wind forecast available was
            published at{" "}
            <strong>{data.forecastPublishTimes.map(fmtDateTime).join(", ") || "– (none available)"}</strong>
            {horizons.length > 0 && (
              <>
                , looking {fmtHours(Math.min(...horizons))}–{fmtHours(Math.max(...horizons))} ahead
              </>
            )}
            .
            {data.profile && (
              <>
                {" "}
                Over the previous {lookbackDays} settled days ({fmtDay(data.profile.firstDay)} –{" "}
                {fmtDay(data.profile.lastDay)}) that forecast ran{" "}
                <strong>{fmtSignedGw(data.profile.bias)}</strong> versus outturn on average.
              </>
            )}
          </p>

          <div className="kpis">
            <Kpi label="Forecast wind energy" value={fmtGwh(data.energy.forecastMwh)} hint="Raw Elexon forecast" />
            <Kpi
              label="Bias-adjusted energy"
              value={fmtGwh(correctedMwh)}
              hint="Forecast minus recent bias"
              tone="accent"
            />
            <Kpi
              label="Firm wind (P90) energy"
              value={fmtGwh(firmMwh)}
              hint="Wind you can count on ~9 times in 10"
              tone="good"
            />
            {showActual && (
              <>
                <Kpi label="Actual wind energy" value={fmtGwh(data.energy.actualMwh)} hint="Revealed after delivery" />
                <Kpi
                  label="Forecast error (MAE)"
                  value={fmtGw(data.stats?.mae)}
                  hint={
                    <>
                      bias {fmtSignedGw(data.stats?.bias)} · adjusted MAE {fmtGw(data.correctedStats?.mae)}
                    </>
                  }
                  tone="warn"
                />
              </>
            )}
          </div>

          <Card
            title="Wind generation for the delivery day"
            subtitle="Hourly forecasts as they stood at the decision time; actuals are half-hourly settlement periods."
          >
            <Legend
              items={[
                { color: COLORS.forecast, label: "Forecast (at decision)" },
                { color: COLORS.corrected, label: "Bias-adjusted forecast", dashed: true },
                { color: COLORS.band, label: "Expected range (P10–P90)", area: true },
                ...(showActual ? [{ color: COLORS.actual, label: "Actual" }] : []),
              ]}
            />
            <div className="chart chart-tall">
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={fmtTime}
                    ticks={rows.filter((_, i) => i % 6 === 0).map((r) => r.time)}
                    stroke={COLORS.axis}
                    fontSize={12}
                  />
                  <YAxis
                    tickFormatter={gwAxis}
                    stroke={COLORS.axis}
                    fontSize={12}
                    width={64}
                  />
                  <Tooltip content={(p) => <DayTooltip {...p} showActual={showActual} />} />
                  <Area
                    dataKey="band"
                    stroke="none"
                    fill={COLORS.band}
                    fillOpacity={0.16}
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
            </div>
            <p className="footnote">
              The shaded range and the "firm" level come from errors the desk had already observed before
              the decision: no information from after the decision time is used.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function DayTooltip({ active, payload, showActual }: TooltipContentProps & { showActual: boolean }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as Row;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{fmtDateTime(r.time)}</div>
      {r.forecast != null && (
        <>
          <div>
            Forecast <b>{fmtMw(r.forecast)}</b>
          </div>
          {r.corrected != null && <div>Bias-adjusted {fmtMw(r.corrected)}</div>}
          {r.firm != null && (
            <div>
              Range {fmtMw(r.firm)} – {fmtMw(r.upside)}
            </div>
          )}
          <div className="muted">
            published {r.publishTime && fmtDateTime(r.publishTime)} ({fmtHours(r.horizonH ?? 0)} ahead)
          </div>
        </>
      )}
      {showActual && (
        <div>
          Actual <b>{fmtMw(r.actual)}</b>
          {r.error != null && <span className="muted"> · error {fmtSignedGw(r.error)}</span>}
        </div>
      )}
    </div>
  );
}
