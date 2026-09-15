import { useEffect, useRef, useState } from "react";
import { getAiUsageSummary } from "../api.js";

/**
 * Read-only AI usage aggregates — "what are we spending, on what", without grepping a
 * machine's stdout. Consumes GET /api/admin/ai-usage/summary, which aggregates in SQL
 * (the underlying table is the one in this schema designed to grow without bound).
 *
 * Two deliberate choices worth knowing before changing anything here:
 *
 *   1. No vendor price is hardcoded. The backend reports tokens and never money, on the
 *      stated grounds that per-model pricing changes on the vendor's schedule and belongs
 *      to whoever reads it. The optional rate fields below keep that boundary intact — the
 *      operator supplies today's rate, so nothing in this repo can quietly go stale and
 *      start reporting a wrong number as if it were authoritative.
 *
 *   2. Failures are shown beside successes, not hidden. Nothing aggregating failures is
 *      precisely why a real truncation bug (PROFILE_SUMMARY exhausting its output budget
 *      and returning nothing, while still billing in full) stayed invisible until someone
 *      went looking. A non-zero failure count is styled as a problem on purpose.
 */

const WINDOWS = [
  { key: "24h", label: "Last 24 hours", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
  { key: "30d", label: "Last 30 days", hours: 24 * 30 },
  { key: "90d", label: "Last 90 days", hours: 24 * 90 },
];

const DEFAULT_WINDOW = "30d";

function fmtNum(value) {
  return Number(value || 0).toLocaleString();
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function StatCard({ label, value, tone }) {
  return (
    <div className="card" style={{ flex: "1 1 160px", minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          marginTop: 6,
          color: tone === "bad" ? "var(--color-danger, #b42318)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function AiUsage() {
  const [windowKey, setWindowKey] = useState(DEFAULT_WINDOW);
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Changing the window issues a new request while an older one may still be in flight.
  // Without this guard the slower (older) response can resolve last and overwrite the
  // newer one with wrong-window data — a real bug already found and fixed once on the
  // AI Content Review page. Discard anything that is not the most recent request.
  const requestRef = useRef(0);

  const [rateIn, setRateIn] = useState("");
  const [rateOut, setRateOut] = useState("");

  useEffect(() => {
    const requestId = ++requestRef.current;
    const win = WINDOWS.find((w) => w.key === windowKey) || WINDOWS[2];
    const since = new Date(Date.now() - win.hours * 3600 * 1000).toISOString();

    setLoading(true);
    setError(null);

    getAiUsageSummary(since)
      .then((result) => {
        if (requestId !== requestRef.current) return;
        setData(result);
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return;
        setError(err.message);
        setData(null);
      })
      .finally(() => {
        if (requestId !== requestRef.current) return;
        setLoading(false);
      });
  }, [windowKey, reloadToken]);

  const parsedIn = Number.parseFloat(rateIn);
  const parsedOut = Number.parseFloat(rateOut);
  const hasRate = Number.isFinite(parsedIn) || Number.isFinite(parsedOut);
  const estimate =
    data && hasRate
      ? (Number.isFinite(parsedIn) ? (data.totalInputTokens / 1_000_000) * parsedIn : 0) +
        (Number.isFinite(parsedOut) ? (data.totalOutputTokens / 1_000_000) * parsedOut : 0)
      : null;

  return (
    <div>
      <div className="page-header">
        <h1>AI Usage</h1>
      </div>
      <p className="page-intro">
        Every AI call the backend makes is recorded — successes and failures alike — and
        aggregated here by feature and model. Figures are token counts, never money: model
        pricing changes on the vendor&apos;s schedule, so it is not frozen into this app.
        Enter today&apos;s rate below if you want a cost estimate from it.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="toolbar">
        <select value={windowKey} onChange={(e) => setWindowKey(e.target.value)}>
          {WINDOWS.map((w) => (
            <option key={w.key} value={w.key}>
              {w.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => setReloadToken((n) => n + 1)}>
          Refresh
        </button>
        <span className="spacer" />
        {data && <span className="muted-note">Since {fmtDate(data.since)}</span>}
      </div>

      {loading && <p className="page-intro">Loading...</p>}

      {!loading && data && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label="Calls" value={fmtNum(data.totalCalls)} />
            <StatCard label="Input tokens" value={fmtNum(data.totalInputTokens)} />
            <StatCard label="Output tokens" value={fmtNum(data.totalOutputTokens)} />
            <StatCard label="Total tokens" value={fmtNum(data.totalTokens)} />
            <StatCard
              label="Failures"
              value={fmtNum(data.totalFailures)}
              tone={data.totalFailures > 0 ? "bad" : undefined}
            />
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="form-row">
              <div className="form-field">
                <label>Input rate (per 1M tokens)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateIn}
                  placeholder="e.g. 0.15"
                  onChange={(e) => setRateIn(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Output rate (per 1M tokens)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateOut}
                  placeholder="e.g. 0.60"
                  onChange={(e) => setRateOut(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Estimated cost</label>
                <div style={{ fontSize: 20, fontWeight: 600, paddingTop: 4 }}>
                  {estimate == null ? "—" : estimate.toFixed(4)}
                </div>
              </div>
            </div>
            <span className="field-note">
              Calculated in your browser from the rate you typed and the token counts above —
              it is an estimate, not a billing figure, and nothing here is saved. Check the
              provider&apos;s current pricing before relying on it.
            </span>
          </div>

          <h2>By feature and model</h2>
          {data.byFeature.length === 0 ? (
            <p className="page-intro">
              No AI calls recorded in this window. Usage is only recorded from the point the
              database-backed recorder shipped, so an older call will not appear here.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Model</th>
                    <th>Calls</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Total tokens</th>
                    <th>Failures</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byFeature.map((row) => (
                    <tr key={`${row.feature}:${row.model}`}>
                      <td>{row.feature || "—"}</td>
                      <td>{row.model || "—"}</td>
                      <td>{fmtNum(row.calls)}</td>
                      <td>{fmtNum(row.inputTokens)}</td>
                      <td>{fmtNum(row.outputTokens)}</td>
                      <td>{fmtNum(row.totalTokens)}</td>
                      <td>
                        {row.failures > 0 ? (
                          <span className="badge badge-hard">{fmtNum(row.failures)}</span>
                        ) : (
                          fmtNum(row.failures)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
