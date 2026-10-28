import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiUrl, useApi, type Explorer as ExplorerData, type Meta } from "../api";
import { addDays, fmtDateTime, fmtGw, fmtMw, fmtPct, fmtSignedGw, gwAxis } from "../format";
import { COLORS, Card, Field, Kpi, Legend, Status } from "./ui";

const dayTick = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });

export function Explorer({ meta }: { meta: Meta }) {
  const min = addDays(meta.deliveryFirst, -1);
  const max = meta.deliveryLast;
  const [start, setStart] = useState("2026-01-08");
  const [end, setEnd] = useState("2026-01-14");
  const [horizon, setHorizon] = useState(4);
  const [debouncedHorizon, setDebouncedHorizon] = useState(horizon);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedHorizon(horizon), 200);
    return () => clearTimeout(t);
  }, [horizon]);

  const valid = start <= end;
  const { data, error, loading } = useApi<ExplorerData>(
    valid ? apiUrl("explorer", { start, end, horizon_h: debouncedHorizon }) : null,
  );
  const s = data?.stats;

  return (
    <div className="stack">
      <div className="toolbar">
        <Field label="From">
          <input type="date" value={start} min={min} max={max} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={end} min={min} max={max} onChange={(e) => e.target.value && setEnd(e.target.value)} />
        </Field>
        <Field label={`Forecast horizon: at least ${horizon}h ahead`}>
          <input
            type="range"
            min={0}
            max={48}
            step={1}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="slider"
          />
        </Field>
        {!valid && <div className="status status-error">"From" must be on or before "To".</div>}
        <Status loading={loading && !data} error={error} />
      </div>

      <p className="lede">
        For each hour, the line shows the most recent forecast published at least <strong>{horizon} hours</strong>{" "}
        before it. Move the slider to see how accuracy changes as decisions are made further ahead.
      </p>

      {s && (
        <div className="kpis">
          <Kpi label="MAE" value={fmtGw(s.mae)} hint={`${fmtPct(s.nmaePct)} of mean output`} tone="warn" />
          <Kpi label="Bias" value={fmtSignedGw(s.bias)} hint="forecast − actual" />
          <Kpi label="RMSE" value={fmtGw(s.rmse)} />
          <Kpi label="P10 / P90 error" value={`${(s.p10 / 1000).toFixed(1)} / ${(s.p90 / 1000).toFixed(1)}`}
            hint="GW, forecast − actual" />
          <Kpi label="Hours compared" value={s.n} />
        </div>
      )}

      {data && (
        <Card title="Actual vs forecast wind generation">
          <Legend
            items={[
              { color: COLORS.actual, label: "Actual" },
              { color: COLORS.forecast, label: `Forecast (≥ ${data.horizonH}h ahead)` },
            ]}
          />
          <div className="chart chart-tall">
            <ResponsiveContainer>
              <LineChart data={data.points} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="time"
                  tickFormatter={(t: string) => dayTick.format(new Date(t))}
                  ticks={data.points.filter((p) => p.time.endsWith("T00:00:00Z")).map((p) => p.time)}
                  stroke={COLORS.axis}
                  fontSize={12}
                />
                <YAxis tickFormatter={gwAxis} stroke={COLORS.axis} fontSize={12} width={64} />
                <Tooltip
                  labelFormatter={(t) => fmtDateTime(String(t))}
                  formatter={(v, name) => [fmtMw(Number(v)), name]}
                />
                <Line dataKey="actual" name="Actual" stroke={COLORS.actual} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="forecast" name="Forecast" stroke={COLORS.forecast} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
