# Demo video outline (max 10 minutes, unlisted YouTube)

## Part 1: Client pitch (about 5 min), for the day-ahead trading team

1. **The problem (30s).** "Every morning before 11:00 you decide how much power to buy for
   tomorrow. Wind covers a big but uncertain share. Buy too little and you're exposed to
   imbalance prices; buy too much and you pay for power you don't need."
2. **Day-ahead view (2 min).** Open Thu 15 Jan.
   - The sentence at the top: decision at 11:00, the 09:30 forecast was the latest available,
     14.5–37.5h ahead.
   - Untick "Reveal actual outturn" to show exactly what the desk saw. Point out the forecast,
     the bias-adjusted line, the shaded P10–P90 range and the firm-wind P90 energy (166 GWh vs
     280 GWh raw forecast).
   - Tick it again to show the actual (254 GWh): it landed inside the range, close to the
     adjusted line.
   - Step to Wed 28 Jan (the hardest day) to show a miss honestly.
3. **Forecast accuracy (1.5 min).**
   - Headline: typical error 2.0 GW (18% of output); forecasts over-state wind by 1.7 GW on
     average; 1 hour in 10 is over-forecast by more than 4.2 GW.
   - The bias adjustment cuts the error by 25% using only data known before each decision. The
     P10–P90 range holds 81% of the time (target 80%).
   - Lead-time chart: the auction window sits 14.5–37.5h ahead, and error grows with lead time.
4. **Explorer (30s).** Drag the horizon slider from 0h to 48h and watch MAE rise.
5. **Close (30s).** "Pilot outcome: a quantified, auditable view of wind risk for every
   day-ahead decision. Next steps: add demand forecasts to turn the firm-wind level into a buy
   recommendation, extend to solar and embedded wind, and run it live every morning."

## Part 2: Tech lead review (about 5 min)

1. **Architecture (1 min).** README diagram: React SPA → FastAPI → pure analysis module →
   committed Elexon snapshot (live mode available). One Docker image serves both; on Vercel,
   static files plus a Python function.
2. **Data and correctness (1.5 min).** `backend/app/analysis.py`:
   - `WindData` indexes forecasts per target hour with sorted publish times; `latest_forecast`
     uses `bisect` to get the latest forecast as of time *t*.
   - Rows published after their target are dropped (they are not forecasts).
   - Decision and delivery windows are defined in Europe/London time and computed in UTC
     (DST-safe, tested).
   - `trailing_profile`: only delivery days fully settled before the decision (≤ D-2), so there
     is no look-ahead.
3. **API (45s).** `main.py`: thin routes, query validation, `lru_cache` on the monthly report,
   `/docs` OpenAPI.
4. **Frontend (45s).** `api.ts` typed models mirror the backend; `useApi` cancels stale requests;
   three components; UK-local formatting in `format.ts`.
5. **Practices (1 min).** pytest unit tests on synthetic data where the answer is known, plus API
   tests on the snapshot; ruff lint/format; strict TypeScript; CI workflow (lint, tests, build,
   Docker smoke test); environment-based config (`DATA_SOURCE`, `PORT`); AI-assisted development disclosed in
   the README.
