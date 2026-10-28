import { useState, type CSSProperties } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiUrl, useApi, type Explorer as ExplorerData, type Meta } from "../api";
import { addDays, fmtDateTime, fmtGw, fmtMw, fmtPct, fmtSignedGw, gwAxis } from "../format";
import { useDebounced, useIsMobile } from "../hooks";
import { IconAlert, IconCalendar, IconCompass, IconGauge, IconTrend } from "./icons";
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
} from "./ui";
import { axisProps, COLORS } from "../theme";
import { seriesTooltip } from "./seriesTooltip";

const dayTick = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
});

export function Explorer({ meta }: { meta: Meta }) {
  const min = addDays(meta.deliveryFirst, -1);
  const max = meta.deliveryLast;
  const presets = [
    { label: "Week 1", start: min, end: addDays(min, 6) },
    { label: "Week 2", start: addDays(min, 7), end: addDays(min, 13) },
    { label: "Week 3", start: addDays(min, 14), end: addDays(min, 20) },
    { label: "Week 4", start: addDays(min, 21), end: addDays(min, 27) },
    { label: "Full month", start: min, end: max },
  ];

  const [range, setRange] = useState({ start: presets[1].start, end: presets[1].end });
  const [horizon, setHorizon] = useState(4);
  const debouncedHorizon = useDebounced(horizon, 200);
  const mobile = useIsMobile();

  const valid = range.start <= range.end;
  const { data, error, loading, reload } = useApi<ExplorerData>(
    valid ? apiUrl("explorer", { start: range.start, end: range.end, horizon_h: debouncedHorizon }) : null,
  );
  const s = data?.stats;
  const midnights = data?.points.filter((p) => p.time.endsWith("T00:00:00Z")).map((p) => p.time) ?? [];
  const tickEvery = Math.max(1, Math.ceil(midnights.length / (mobile ? 4 : 10)));

  return (
    <div className="stack">
      <PageIntro title="Explorer">
        Compare actual wind with the most recent forecast published at least <strong>{horizon} hours</strong>{" "}
        before each hour. Move the slider to see how accuracy changes as decisions are made further ahead.
      </PageIntro>

      <div className="toolbar card">
        <div className="presets" role="group" aria-label="Date range presets">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={p.start === range.start && p.end === range.end ? "chip active" : "chip"}
              onClick={() => setRange({ start: p.start, end: p.end })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="toolbar-row">
          <Field label="From">
            <input
              type="date"
              value={range.start}
              min={min}
              max={max}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, start: e.target.value }))}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={range.end}
              min={min}
              max={max}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, end: e.target.value }))}
            />
          </Field>
          <Field
            grow
            label={
              <>
                Forecast horizon <span className="pill">≥ {horizon}h ahead</span>
              </>
            }
          >
            <input
              type="range"
              min={0}
              max={48}
              step={1}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="slider"
              style={{ "--fill": `${(horizon / 48) * 100}%` } as CSSProperties}
              aria-valuetext={`${horizon} hours ahead`}
            />
            <div className="slider-scale" aria-hidden="true">
              <span>now</span>
              <span>12h</span>
              <span>24h</span>
              <span>36h</span>
              <span>48h</span>
            </div>
          </Field>
        </div>
      </div>

      {!valid && <ErrorState message={'"From" must be on or before "To".'} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {valid && !data && !error && <LoadingPage />}

      {data && (
        <>
          <LoadingBar active={loading} />
          {s && (
            <KpiGrid>
              <Kpi
                label="Typical error"
                value={fmtGw(s.mae)}
                hint={`MAE · ${fmtPct(s.nmaePct)} of mean output`}
                icon={<IconGauge />}
                tone="orange"
              />
              <Kpi
                label="Bias"
                value={fmtSignedGw(s.bias)}
                hint="Mean of forecast − actual"
                icon={<IconAlert />}
                tone="neutral"
              />
              <Kpi label="RMSE" value={fmtGw(s.rmse)} hint="Penalises large misses" icon={<IconTrend />} />
              <Kpi
                label="P10 / P90 error"
                value={`${(s.p10 / 1000).toFixed(1)} / ${(s.p90 / 1000).toFixed(1)}`}
                hint="GW, 80% of hours fall between"
                icon={<IconCompass />}
                tone="violet"
              />
              <Kpi
                label="Hours compared"
                value={s.n.toLocaleString("en-GB")}
                hint="Hourly forecast/actual pairs"
                icon={<IconCalendar />}
                tone="blue"
              />
            </KpiGrid>
          )}

          <Card title="Actual vs forecast wind generation">
            <Legend
              items={[
                { color: COLORS.actual, label: "Actual" },
                { color: COLORS.forecast, label: `Forecast (≥ ${data.horizonH}h ahead)` },
              ]}
            />
            <ChartBox height={[280, 420]}>
              <ResponsiveContainer>
                <LineChart data={data.points} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(t: string) => dayTick.format(new Date(t))}
                    ticks={midnights.filter((_, i) => i % tickEvery === 0)}
                    {...axisProps}
                  />
                  <YAxis tickFormatter={gwAxis} {...axisProps} width={60} />
                  <Tooltip
                    content={seriesTooltip(fmtMw, (t) => fmtDateTime(String(t)))}
                    cursor={{ stroke: COLORS.axis, strokeDasharray: "3 3" }}
                  />
                  <Line
                    dataKey="actual"
                    name="Actual"
                    stroke={COLORS.actual}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="forecast"
                    name="Forecast"
                    stroke={COLORS.forecast}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
          </Card>
        </>
      )}
    </div>
  );
}
