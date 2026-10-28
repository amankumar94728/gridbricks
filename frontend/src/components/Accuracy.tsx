import type { ReactNode } from "react";
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
import { fmtDay, fmtGw, fmtGwh, fmtHours, fmtPct, fmtSignedGw, gwAxis, pad2 } from "../format";
import { useIsMobile } from "../hooks";
import { IconAlert, IconCompass, IconGauge, IconShield, IconTarget, IconTrend } from "./icons";
import { Card, ChartBox, ErrorState, Kpi, KpiGrid, Legend, LoadingBar, LoadingPage, PageIntro } from "./ui";
import { axisProps, COLORS } from "../theme";
import { seriesTooltip } from "./seriesTooltip";

interface Props {
  decisionHour: number;
  lookbackDays: number;
}

const gwTooltip = (mw: number) => fmtGw(mw);
const cursor = { stroke: COLORS.axis, strokeDasharray: "3 3" };

export function Accuracy({ decisionHour, lookbackDays }: Props) {
  const mobile = useIsMobile();
  const { data, error, loading, reload } = useApi<AccuracyData>(
    apiUrl("accuracy", { decision_hour: decisionHour, lookback_days: lookbackDays }),
  );

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingPage />;

  const { raw, corrected } = data;
  const improvement = 100 * (1 - corrected.mae / raw.mae);
  const [hzLo, hzHi] = data.horizonRangeH ?? [0, 0];
  const worstDay = data.daily.reduce((a, b) => (b.mae > a.mae ? b : a));
  const totalActual = data.daily.reduce((s, d) => s + (d.actualMwh ?? 0), 0);
  const totalForecast = data.daily.reduce((s, d) => s + (d.forecastMwh ?? 0), 0);
  const chartHeight: [number, number] = [240, 290];
  const yWidth = 60;

  return (
    <div className="stack">
      <PageIntro title="Forecast accuracy">
        Every delivery day from <strong>{fmtDay(data.deliveryFirst)}</strong> to{" "}
        <strong>{fmtDay(data.deliveryLast)}</strong>, judged with the forecast the desk actually had at{" "}
        <strong>{pad2(decisionHour)}:00 on D-1</strong>: {raw.n.toLocaleString("en-GB")} hourly comparisons,{" "}
        {fmtHours(hzLo)}–{fmtHours(hzHi)} ahead.
      </PageIntro>

      <LoadingBar active={loading} />
      {error && <ErrorState message={error} onRetry={reload} />}

      <KpiGrid>
        <Kpi
          label="Typical error"
          value={fmtGw(raw.mae)}
          hint={`MAE · ${fmtPct(raw.nmaePct)} of average output`}
          icon={<IconGauge />}
          tone="orange"
        />
        <Kpi
          label="Systematic bias"
          value={fmtSignedGw(raw.bias)}
          hint={raw.bias > 0 ? "Forecast over-states wind" : "Forecast under-states wind"}
          icon={<IconAlert />}
          tone="orange"
        />
        <Kpi
          label="1-in-10 miss"
          value={fmtGw(raw.p90)}
          hint="P90 over-forecast"
          icon={<IconCompass />}
          tone="neutral"
        />
        <Kpi
          label="Bias-adjusted error"
          value={fmtGw(corrected.mae)}
          hint={`${improvement.toFixed(0)}% lower, no look-ahead`}
          icon={<IconTrend />}
          tone="green"
        />
        <Kpi
          label="Range reliability"
          value={fmtPct(data.bandCoveragePct)}
          hint={`in P10–P90 range (target 80%)`}
          icon={<IconShield />}
          tone="violet"
        />
      </KpiGrid>

      <div className="insights">
        <Insight icon={<IconAlert />} tone="orange" title="Forecasts run high">
          The month's forecasts promised <b>{fmtGwh(totalForecast)}</b> of wind; <b>{fmtGwh(totalActual)}</b>{" "}
          arrived. Buying against the raw forecast leaves the book <b>{fmtGw(raw.bias)}</b> short in an
          average hour.
        </Insight>
        <Insight icon={<IconCompass />} tone="blue" title="Errors are lopsided">
          Half of all hours were over-forecast by more than <b>{fmtGw(raw.p50)}</b>, one in ten by more than{" "}
          <b>{fmtGw(raw.p90)}</b>. Only {fmtPct(raw.within1GwPct)} landed within ±1 GW.
        </Insight>
        <Insight icon={<IconTrend />} tone="green" title="A simple fix works">
          Removing the bias seen over the previous {lookbackDays} settled days cuts the typical error from{" "}
          <b>{fmtGw(raw.mae)}</b> to <b>{fmtGw(corrected.mae)}</b> ({improvement.toFixed(0)}%).
        </Insight>
        <Insight icon={<IconTarget />} tone="violet" title="Plan for bad days">
          The hardest day was <b>{fmtDay(worstDay.day)}</b> (MAE {fmtGw(worstDay.mae)}). Actual wind fell
          below the firm P90 level in {fmtPct(data.belowFirmPct)} of hours (target 10%).
        </Insight>
      </div>

      <div className="grid-2">
        <Card
          title="Error by forecast lead time"
          subtitle="Latest forecast published at least N hours before each hour."
        >
          <Legend
            items={[
              { color: COLORS.forecast, label: "MAE" },
              { color: COLORS.bias, label: "Bias" },
              { color: COLORS.band, label: "Day-ahead decision window", area: true },
            ]}
          />
          <ChartBox height={chartHeight}>
            <ResponsiveContainer>
              <LineChart data={data.byHorizon} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <ReferenceArea
                  x1={Math.floor(hzLo)}
                  x2={Math.ceil(hzHi)}
                  fill={COLORS.band}
                  fillOpacity={0.12}
                />
                <XAxis
                  dataKey="horizonH"
                  type="number"
                  domain={[0, 48]}
                  ticks={mobile ? [0, 12, 24, 36, 48] : [0, 6, 12, 18, 24, 30, 36, 42, 48]}
                  tickFormatter={(h: number) => `${h}h`}
                  {...axisProps}
                />
                <YAxis tickFormatter={gwAxis} {...axisProps} width={yWidth} />
                <Tooltip content={seriesTooltip(gwTooltip, (h) => `${h}h ahead`)} cursor={cursor} />
                <Line dataKey="mae" name="MAE" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} />
                <Line dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>
          <p className="footnote">Beyond ~42h, some hours have no forecast published that far ahead.</p>
        </Card>

        <Card title="Distribution of errors" subtitle="Forecast − actual in 500 MW bins.">
          <Legend
            items={[
              { color: COLORS.bias, label: "Over-forecast (short)", area: true },
              { color: COLORS.under, label: "Under-forecast (long)", area: true },
            ]}
          />
          <ChartBox height={chartHeight}>
            <ResponsiveContainer>
              <BarChart data={data.histogram} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="from" tickFormatter={gwAxis} interval={mobile ? 3 : 1} {...axisProps} />
                <YAxis tickFormatter={(v: number) => `${v}%`} {...axisProps} width={44} />
                <Tooltip
                  content={seriesTooltip(
                    (v) => `${v.toFixed(1)}% of hours`,
                    (from) => `${gwAxis(Number(from))} to ${gwAxis(Number(from) + 500)}`,
                  )}
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                />
                <Bar dataKey="pct" name="Share" radius={[4, 4, 0, 0]}>
                  {data.histogram.map((b) => (
                    <Cell key={b.from} fill={b.from >= 0 ? COLORS.bias : COLORS.under} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Card>

        <Card title="Daily error" subtitle="Mean absolute error per delivery day.">
          <Legend
            items={[
              { color: COLORS.forecast, label: "Raw forecast", area: true },
              { color: COLORS.corrected, label: "Bias-adjusted", dashed: true },
            ]}
          />
          <ChartBox height={chartHeight}>
            <ResponsiveContainer>
              <ComposedChart data={data.daily} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => String(Number(d.slice(8)))}
                  interval={mobile ? 6 : 2}
                  {...axisProps}
                />
                <YAxis tickFormatter={gwAxis} {...axisProps} width={yWidth} />
                <Tooltip
                  content={seriesTooltip(gwTooltip, (d) => fmtDay(String(d)))}
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                />
                <Bar
                  dataKey="mae"
                  name="Raw MAE"
                  fill={COLORS.forecast}
                  fillOpacity={0.8}
                  radius={[3, 3, 0, 0]}
                />
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
          </ChartBox>
        </Card>

        <Card title="Error by hour of delivery" subtitle="UK local hour of the delivery day.">
          <Legend
            items={[
              { color: COLORS.forecast, label: "MAE" },
              { color: COLORS.bias, label: "Bias" },
              { color: COLORS.corrected, label: "Bias-adjusted MAE", dashed: true },
            ]}
          />
          <ChartBox height={chartHeight}>
            <ResponsiveContainer>
              <LineChart data={data.byHourOfDay} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(h: number) => `${pad2(h)}:00`}
                  interval={mobile ? 5 : 3}
                  {...axisProps}
                />
                <YAxis tickFormatter={gwAxis} {...axisProps} width={yWidth} />
                <ReferenceLine y={0} stroke={COLORS.muted} />
                <Tooltip content={seriesTooltip(gwTooltip, (h) => `${pad2(Number(h))}:00`)} cursor={cursor} />
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
          </ChartBox>
        </Card>
      </div>

      <Card title="How the numbers are calculated">
        <dl className="defs">
          <dt>Error</dt>
          <dd>
            Forecast − actual (MW) for each hour. Positive means wind was over-forecast and the book is short.
          </dd>
          <dt>MAE · RMSE</dt>
          <dd>
            Mean absolute error and root mean squared error. RMSE weights large misses more heavily (
            {fmtGw(raw.rmse)} raw).
          </dd>
          <dt>Bias-adjusted forecast</dt>
          <dd>
            Forecast minus the mean error over the previous {lookbackDays} delivery days that had fully
            settled by the decision time.
          </dd>
          <dt>Firm wind (P90) · range</dt>
          <dd>
            Forecast minus the 90th / 10th percentile of those recent errors. Actual wind should beat the firm
            level about nine hours in ten.
          </dd>
        </dl>
      </Card>
    </div>
  );
}

function Insight({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: "orange" | "blue" | "green" | "violet";
  children: ReactNode;
}) {
  return (
    <article className={`insight tone-${tone}`}>
      <span className="insight-icon">{icon}</span>
      <div>
        <h4>{title}</h4>
        <p>{children}</p>
      </div>
    </article>
  );
}
