import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiUrl, useApi, type Accuracy as AccuracyData } from "../api";
import { fmtDay, fmtGw, fmtGwh, fmtHours, fmtPct, fmtSignedGw, pad2 } from "../format";
import { COLORS, Card, Kpi, Legend, Status } from "./ui";

interface Props {
  decisionHour: number;
  lookbackDays: number;
}

const gwTick = (v: number) => `${(v / 1000).toFixed(1)}`;
const gwTooltip = (v: unknown) => fmtGw(Number(v));

export function Accuracy({ decisionHour, lookbackDays }: Props) {
  const { data, error, loading } = useApi<AccuracyData>(
    apiUrl("accuracy", { decision_hour: decisionHour, lookback_days: lookbackDays }),
  );

  if (!data) return <Status loading={loading} error={error} />;

  const { raw, corrected } = data;
  const improvement = 100 * (1 - corrected.mae / raw.mae);
  const [hzLo, hzHi] = data.horizonRangeH ?? [0, 0];
  const worstDay = data.daily.reduce((a, b) => (b.mae > a.mae ? b : a));
  const totalActual = data.daily.reduce((s, d) => s + (d.actualMwh ?? 0), 0);
  const totalForecast = data.daily.reduce((s, d) => s + (d.forecastMwh ?? 0), 0);

  return (
    <div className="stack">
      <Status loading={loading} error={error} />
      <p className="lede">
        Every delivery day from <strong>{fmtDay(data.deliveryFirst)}</strong> to{" "}
        <strong>{fmtDay(data.deliveryLast)}</strong> evaluated with the forecast the desk actually had at{" "}
        <strong>{pad2(decisionHour)}:00 on D-1</strong> ({fmtHours(hzLo)}–{fmtHours(hzHi)} ahead),{" "}
        {raw.n} hourly comparisons.
      </p>

      <div className="kpis">
        <Kpi
          label="Typical error (MAE)"
          value={fmtGw(raw.mae)}
          hint={`${fmtPct(raw.nmaePct)} of average wind output`}
          tone="warn"
        />
        <Kpi
          label="Systematic bias"
          value={fmtSignedGw(raw.bias)}
          hint={raw.bias > 0 ? "Forecast over-states wind" : "Forecast under-states wind"}
          tone="warn"
        />
        <Kpi
          label="1-in-10 over-forecast"
          value={fmtGw(raw.p90)}
          hint="P90 of forecast − actual"
        />
        <Kpi
          label="Bias-adjusted MAE"
          value={fmtGw(corrected.mae)}
          hint={`${improvement.toFixed(0)}% lower, using only the past ${lookbackDays} days`}
          tone="good"
        />
        <Kpi
          label="P10–P90 range hit rate"
          value={fmtPct(data.bandCoveragePct)}
          hint={`target 80% · below firm level ${fmtPct(data.belowFirmPct)} (target 10%)`}
          tone="accent"
        />
      </div>

      <Card title="Key findings">
        <ul className="findings">
          <li>
            Over the month the forecast promised <b>{fmtGwh(totalForecast)}</b> of wind; <b>{fmtGwh(totalActual)}</b>{" "}
            was delivered. Buying against the raw forecast would leave the book short by{" "}
            <b>{fmtSignedGw(raw.bias)}</b> on an average hour.
          </li>
          <li>
            Errors are not symmetric: half of all hours were over-forecast by more than <b>{fmtGw(raw.p50)}</b>, and
            one hour in ten by more than <b>{fmtGw(raw.p90)}</b>. Only {fmtPct(raw.within1GwPct)} of hours were within
            ±1 GW.
          </li>
          <li>
            Removing the bias seen over the previous {lookbackDays} settled days cuts the typical error from{" "}
            <b>{fmtGw(raw.mae)}</b> to <b>{fmtGw(corrected.mae)}</b> ({improvement.toFixed(0)}%), with no look-ahead.
          </li>
          <li>
            Accuracy decays with lead time: forecasts made at the auction are{" "}
            {fmtHours(hzLo)}–{fmtHours(hzHi)} ahead. The hardest day was <b>{fmtDay(worstDay.day)}</b> (MAE{" "}
            {fmtGw(worstDay.mae)}).
          </li>
        </ul>
      </Card>

      <div className="grid-2">
        <Card
          title="Error by forecast lead time"
          subtitle="Latest forecast published at least N hours before each target hour. Beyond ~42h some hours have no forecast that far ahead."
        >
          <Legend
            items={[
              { color: COLORS.forecast, label: "MAE" },
              { color: COLORS.bias, label: "Bias" },
              { color: COLORS.band, label: "Day-ahead decision window", area: true },
            ]}
          />
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={data.byHorizon} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <ReferenceArea x1={Math.floor(hzLo)} x2={Math.ceil(hzHi)} fill={COLORS.band} fillOpacity={0.12} />
                <XAxis
                  dataKey="horizonH"
                  type="number"
                  domain={[0, 48]}
                  ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
                  stroke={COLORS.axis}
                  fontSize={12}
                  label={{ value: "hours ahead", position: "insideBottom", offset: -8, fontSize: 12 }}
                />
                <YAxis tickFormatter={gwTick} stroke={COLORS.axis} fontSize={12} unit=" GW" width={60} />
                <Tooltip formatter={gwTooltip} labelFormatter={(h) => `${h}h ahead`} />
                <Line dataKey="mae" name="MAE" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} />
                <Line dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Distribution of errors" subtitle="Forecast − actual, 500 MW bins. Right of zero = over-forecast.">
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={data.histogram} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="from"
                  tickFormatter={gwTick}
                  stroke={COLORS.axis}
                  fontSize={12}
                  label={{ value: "GW", position: "insideBottomRight", offset: -8, fontSize: 12 }}
                />
                <YAxis stroke={COLORS.axis} fontSize={12} unit="%" width={44} />
                <Tooltip
                  formatter={(v) => `${Number(v).toFixed(1)}% of hours`}
                  labelFormatter={(from) => `${gwTick(Number(from))} to ${gwTick(Number(from) + 500)} GW`}
                />
                <Bar dataKey="pct" name="Share">
                  {data.histogram.map((b) => (
                    <Cell key={b.from} fill={b.from >= 0 ? COLORS.bias : COLORS.actual} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Daily error" subtitle="Mean absolute error per delivery day, raw vs bias-adjusted.">
          <Legend
            items={[
              { color: COLORS.forecast, label: "Raw forecast" },
              { color: COLORS.corrected, label: "Bias-adjusted", dashed: true },
            ]}
          />
          <div className="chart">
            <ResponsiveContainer>
              <ComposedChart data={data.daily} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => d.slice(8)}
                  stroke={COLORS.axis}
                  fontSize={12}
                  interval={2}
                />
                <YAxis tickFormatter={gwTick} stroke={COLORS.axis} fontSize={12} unit=" GW" width={60} />
                <Tooltip formatter={gwTooltip} labelFormatter={(d) => fmtDay(String(d))} />
                <Bar dataKey="mae" name="Raw MAE" fill={COLORS.forecast} fillOpacity={0.75} />
                <Line
                  dataKey="correctedMae"
                  name="Bias-adjusted MAE"
                  stroke={COLORS.corrected}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Error by hour of delivery" subtitle="UK local hour of the delivery day.">
          <Legend
            items={[
              { color: COLORS.forecast, label: "MAE" },
              { color: COLORS.bias, label: "Bias" },
              { color: COLORS.corrected, label: "Bias-adjusted MAE", dashed: true },
            ]}
          />
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={data.byHourOfDay} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h: number) => `${pad2(h)}:00`} stroke={COLORS.axis} fontSize={12} interval={3} />
                <YAxis tickFormatter={gwTick} stroke={COLORS.axis} fontSize={12} unit=" GW" width={60} />
                <ReferenceLine y={0} stroke={COLORS.muted} />
                <Tooltip formatter={gwTooltip} labelFormatter={(h) => `${pad2(Number(h))}:00`} />
                <Line dataKey="mae" name="MAE" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} />
                <Line dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} dot={false} />
                <Line
                  dataKey="correctedMae"
                  name="Bias-adjusted MAE"
                  stroke={COLORS.corrected}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Metric definitions">
        <dl className="defs">
          <dt>Error</dt>
          <dd>Forecast − actual, in MW, for each hourly target. Positive means wind was over-forecast and the book is short.</dd>
          <dt>MAE / RMSE</dt>
          <dd>Mean absolute error / root mean squared error. RMSE weights large misses more heavily ({fmtGw(raw.rmse)} raw).</dd>
          <dt>Bias-adjusted forecast</dt>
          <dd>
            Forecast minus the mean error over the previous {lookbackDays} delivery days that had fully settled by the
            decision time.
          </dd>
          <dt>Firm wind (P90) and range</dt>
          <dd>
            Forecast minus the 90th / 10th percentile of those recent errors. Actual wind should beat the firm level about
            nine hours in ten.
          </dd>
        </dl>
      </Card>
    </div>
  );
}
