import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { apiUrl, useApi, type Meta } from "./api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { IconCalendar, IconCompass, IconDatabase, IconGauge, IconSliders, Logo } from "./components/icons";
import { ErrorState, Field, LoadingPage, Segmented } from "./components/ui";
import { fmtDateTime, fmtDay, pad2 } from "./format";

// Each view (and Recharts with it) loads on demand, keeping the first paint light.
const DayAhead = lazy(() => import("./components/DayAhead").then((m) => ({ default: m.DayAhead })));
const Accuracy = lazy(() => import("./components/Accuracy").then((m) => ({ default: m.Accuracy })));
const Explorer = lazy(() => import("./components/Explorer").then((m) => ({ default: m.Explorer })));

const TABS: { id: TabId; label: string; short: string; icon: ReactNode }[] = [
  { id: "day-ahead", label: "Day-ahead view", short: "Day-ahead", icon: <IconCalendar /> },
  { id: "accuracy", label: "Forecast accuracy", short: "Accuracy", icon: <IconGauge /> },
  { id: "explorer", label: "Explorer", short: "Explorer", icon: <IconCompass /> },
];

type TabId = "day-ahead" | "accuracy" | "explorer";

const tabFromHash = (): TabId => {
  const id = window.location.hash.slice(1);
  return TABS.some((t) => t.id === id) ? (id as TabId) : "day-ahead";
};

/** Current tab, kept in the URL hash so views can be bookmarked and shared. */
function useTab(): TabId {
  const [tab, setTab] = useState(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return tab;
}

export default function App() {
  const meta = useApi<Meta>(apiUrl("meta"));
  const tab = useTab();
  const [decisionHour, setDecisionHour] = useState(11);
  const [lookbackDays, setLookbackDays] = useState(14);
  const m = meta.data;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#day-ahead">
            <Logo />
            <div>
              <h1>Wind Forecast Desk</h1>
              <p>GB wind · day-ahead procurement</p>
            </div>
          </a>
          <nav className="tabs" aria-label="Views">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className={tab === t.id ? "tab active" : "tab"}
                aria-current={tab === t.id ? "page" : undefined}
              >
                {t.icon}
                <span className="tab-label">{t.label}</span>
                <span className="tab-short">{t.short}</span>
              </a>
            ))}
          </nav>
          {m && (
            <div className="scope" title="Scope of this pilot">
              <span className="dot" />
              Decisions {fmtDay(m.decisionFirst)} – {fmtDay(m.decisionLast)} 2026
            </div>
          )}
        </div>
      </header>

      <main className="content">
        {meta.error && <ErrorState message={meta.error} onRetry={meta.reload} />}
        {!m && !meta.error && <LoadingPage />}
        {m && (
          <>
            {tab !== "explorer" && (
              <section className="settings" aria-label="Decision settings">
                <div className="settings-title">
                  <IconSliders size={16} />
                  Decision settings
                </div>
                <Field label="Decision time (D-1, UK)">
                  <select value={decisionHour} onChange={(e) => setDecisionHour(Number(e.target.value))}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {pad2(h)}:00{h === m.defaultDecisionHour ? " · auction gate closure" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Learn errors from the last">
                  <Segmented
                    ariaLabel="Learning window"
                    value={lookbackDays}
                    onChange={setLookbackDays}
                    options={[3, 7, 14, 21]
                      .filter((d) => d <= m.maxLookbackDays)
                      .map((d) => ({ value: d, label: `${d} days` }))}
                  />
                </Field>
              </section>
            )}
            <ErrorBoundary key={tab}>
              <Suspense fallback={<LoadingPage />}>
                {tab === "day-ahead" && (
                  <DayAhead meta={m} decisionHour={decisionHour} lookbackDays={lookbackDays} />
                )}
                {tab === "accuracy" && <Accuracy decisionHour={decisionHour} lookbackDays={lookbackDays} />}
                {tab === "explorer" && <Explorer meta={m} />}
              </Suspense>
            </ErrorBoundary>
          </>
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>
            <IconDatabase size={14} /> {m?.source ?? "Elexon BMRS"}
          </span>
          {m && <span>Forecasts published daily at {m.publishHoursUtc.join(" · ")} UTC</span>}
          {m?.fetchedAt && <span>Data snapshot {fmtDateTime(m.fetchedAt)}</span>}
        </div>
      </footer>
    </div>
  );
}
