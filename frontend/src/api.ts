import { useCallback, useEffect, useState } from "react";

// Types mirror the JSON returned by backend/app/analysis.py.
// error = forecast - actual (MW): positive means wind was over-forecast.

export interface Stats {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  nmaePct: number | null;
  p10: number;
  p50: number;
  p90: number;
  maxOver: number;
  maxUnder: number;
  within1GwPct: number;
  meanActual: number;
}

export interface Point {
  time: string;
  actual: number | null;
  forecast?: number;
  publishTime?: string;
  horizonH?: number;
  error?: number | null;
  corrected?: number;
  firm?: number;
  upside?: number;
}

export interface Profile {
  bias: number;
  p10: number;
  p90: number;
  n: number;
  firstDay: string;
  lastDay: string;
}

export interface Energy {
  actualMwh: number | null;
  forecastMwh: number | null;
}

export interface Meta {
  decisionFirst: string;
  decisionLast: string;
  deliveryFirst: string;
  deliveryLast: string;
  defaultDecisionHour: number;
  defaultLookbackDays: number;
  maxLookbackDays: number;
  publishHoursUtc: string[];
  fetchedAt: string | null;
  source: string;
}

export interface DayAhead {
  deliveryDay: string;
  decisionTime: string;
  forecastPublishTimes: string[];
  profile: Profile | null;
  energy: Energy;
  stats: Stats | null;
  correctedStats: Stats | null;
  points: Point[];
}

export interface Accuracy {
  decisionHour: number;
  lookbackDays: number;
  deliveryFirst: string;
  deliveryLast: string;
  horizonRangeH: [number, number] | null;
  raw: Stats;
  corrected: Stats;
  bandCoveragePct: number;
  belowFirmPct: number;
  byHourOfDay: { hour: number; mae: number; bias: number; correctedMae: number }[];
  daily: ({ day: string; mae: number; bias: number; correctedMae: number } & Energy)[];
  histogram: { from: number; to: number; count: number; pct: number }[];
  byHorizon: {
    horizonH: number;
    n: number;
    mae: number;
    rmse: number;
    bias: number;
    p10: number;
    p90: number;
  }[];
}

export interface Explorer {
  start: string;
  end: string;
  horizonH: number;
  stats: Stats | null;
  points: Point[];
}

type Params = Record<string, string | number>;

export function apiUrl(path: string, params: Params = {}): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  return `/api/${path}${qs ? `?${qs}` : ""}`;
}

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the request (e.g. after an error). */
  reload: () => void;
}

interface Result<T> {
  key: string | null;
  data: T | null;
  error: string | null;
}

/**
 * Fetch JSON for `url`, cancelling stale requests when the url changes.
 * The previous data is kept while a new request is in flight, so views do not flash.
 * `loading` is derived (the latest result is for a different request), so the
 * effect never has to set state synchronously.
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T>>({ key: null, data: null, error: null });
  const key = url ? `${url}#${attempt}` : null;

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ? JSON.stringify(body.detail) : `HTTP ${res.status}`);
        }
        return res.json() as Promise<T>;
      })
      .then((data) => setResult({ key, data, error: null }))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setResult((r) => ({ key, data: r.data, error: err.message }));
      });
    return () => ctrl.abort();
  }, [url, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result.key === key;
  return {
    data: result.data,
    error: current ? result.error : null,
    loading: key !== null && !current,
    reload,
  };
}
