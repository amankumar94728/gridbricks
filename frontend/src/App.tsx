import { useState } from "react";
import { apiUrl, useApi, type Meta } from "./api";
import { Accuracy } from "./components/Accuracy";
import { DayAhead } from "./components/DayAhead";
import { Explorer } from "./components/Explorer";
import { Field, Status } from "./components/ui";
import { fmtDateTime, fmtDay, pad2 } from "./format";

const TABS = [
  { id: "day-ahead", label: "Day-ahead view", blurb: "What the desk saw at the auction, and how it played out" },
  { id: "accuracy", label: "Forecast accuracy", blurb: "How far to trust the forecast, in numbers" },
  { id: "explorer", label: "Explorer", blurb: "Any date range, any forecast horizon" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const meta = useApi<Meta>(apiUrl("meta"));
  const [tab, setTab] = useState<TabId>("day-ahead");
  const [decisionHour, setDecisionHour] = useState(11);
  const [lookbackDays, setLookbackDays] = useState(14);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <div>
            <h1>Wind Forecast Desk</h1>
            <p>GB national wind · day-ahead procurement support</p>
          </div>
        </div>
        {meta.data && (
          <div className="scope">
            Decisions {fmtDay(meta.data.decisionFirst)} – {fmtDay(meta.data.decisionLast)} 2026
          </div>
        )}
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            <small>{t.blurb}</small>
          </button>
        ))}
      </nav>

      <main className="content">
        <Status loading={meta.loading} error={meta.error} />
        {meta.data && (
          <>
            {tab !== "explorer" && (
              <div className="settings">
                <Field label="Decision time (D-1, UK)">
                  <select value={decisionHour} onChange={(e) => setDecisionHour(Number(e.target.value))}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {pad2(h)}:00{h === meta.data!.defaultDecisionHour ? " · auction gate closure" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Learn errors from the last">
                  <select value={lookbackDays} onChange={(e) => setLookbackDays(Number(e.target.value))}>
                    {[3, 7, 14, 21].filter((d) => d <= meta.data!.maxLookbackDays).map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {tab === "day-ahead" && (
              <DayAhead meta={meta.data} decisionHour={decisionHour} lookbackDays={lookbackDays} />
            )}
            {tab === "accuracy" && <Accuracy decisionHour={decisionHour} lookbackDays={lookbackDays} />}
            {tab === "explorer" && <Explorer meta={meta.data} />}
          </>
        )}
      </main>

      <footer className="footer">
        Data: {meta.data?.source ?? "Elexon BMRS"}. Forecasts published daily at{" "}
        {meta.data?.publishHoursUtc.join(", ") ?? "…"} UTC.
        {meta.data?.fetchedAt && <> Snapshot taken {fmtDateTime(meta.data.fetchedAt)}.</>}
      </footer>
    </div>
  );
}
