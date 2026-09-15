import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAiConfig,
  updateAiSettings,
  updateAiProviderConfig,
  testAiConnection,
  getAiProviderModels,
  getAiAuditLog,
  getAiTaskFlags,
  updateAiTaskFlag,
} from "../api.js";

/**
 * AI Admin Control Center. Lets an authorized admin enable/disable AI, pick the active
 * provider, configure a model/API key/base URL per provider, test a connection, and see
 * a recent audit trail — with zero backend code change or redeploy for a normal change.
 *
 * The backend never returns a plaintext API key anywhere, so this page never has one to
 * show either — the password field always starts blank; leaving it blank on save keeps
 * whatever key is already stored (see the field note under it).
 *
 * This is administration only, not a live student feature — see
 * system-design/06-ai-foundation.md for the full AI provider architecture this configures.
 */

const TEST_STATUS_BADGE = {
  SUCCESS: "badge-easy",
  FAILED: "badge-hard",
};

function fmtDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function AiControlCenter() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [settingsForm, setSettingsForm] = useState({ enabled: false, activeProvider: "" });
  const [savingSettings, setSavingSettings] = useState(false);

  const [providerForms, setProviderForms] = useState({});
  const [auditLog, setAuditLog] = useState([]);

  const [taskFlags, setTaskFlags] = useState([]);
  const [savingTaskId, setSavingTaskId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [data, log, flagData] = await Promise.all([getAiConfig(), getAiAuditLog(), getAiTaskFlags()]);
      setConfig(data);
      setSettingsForm({ enabled: data.settings.enabled, activeProvider: data.settings.activeProvider || "" });
      setProviderForms((prev) => {
        const next = {};
        data.providers.forEach((p) => {
          const existing = prev[p.provider];
          next[p.provider] = {
            model: existing ? existing.model : p.model || "",
            apiKey: "",
            baseUrl: "",
            saving: false,
            testing: false,
            testResult: existing ? existing.testResult : null,
            models: existing ? existing.models : null,
            modelsError: null,
          };
        });
        return next;
      });
      setAuditLog(log);
      setTaskFlags(flagData.flags);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleTask(taskId, enabled, expectedVersion) {
    setSavingTaskId(taskId);
    setError(null);
    setNotice(null);
    try {
      await updateAiTaskFlag(taskId, { enabled, expectedVersion });
      const flagData = await getAiTaskFlags();
      setTaskFlags(flagData.flags);
      setNotice(`${taskId} ${enabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTaskId(null);
    }
  }

  function setProviderField(providerId, field, value) {
    setProviderForms((prev) => ({ ...prev, [providerId]: { ...prev[providerId], [field]: value } }));
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    setNotice(null);
    try {
      await updateAiSettings({
        enabled: settingsForm.enabled,
        activeProvider: settingsForm.activeProvider || null,
        expectedVersion: config.settings.version,
      });
      setNotice("Settings saved.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleLoadModels(providerId) {
    setProviderField(providerId, "modelsError", null);
    try {
      const models = await getAiProviderModels(providerId);
      setProviderField(providerId, "models", models);
    } catch (err) {
      setProviderField(providerId, "modelsError", err.message);
    }
  }

  async function handleTestConnection(providerId) {
    setProviderField(providerId, "testing", true);
    setProviderField(providerId, "testResult", null);
    setError(null);
    setNotice(null);
    try {
      const form = providerForms[providerId];
      const result = await testAiConnection(providerId, {
        apiKey: form.apiKey || null,
        model: form.model || null,
        baseUrl: form.baseUrl || null,
      });
      setProviderField(providerId, "testResult", result);
      // Recording the test bumps that provider's stored version -- refresh so a
      // subsequent Save doesn't fail with a stale-version conflict.
      const data = await getAiConfig();
      setConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProviderField(providerId, "testing", false);
    }
  }

  async function handleSaveProvider(providerId, e) {
    e.preventDefault();
    setProviderField(providerId, "saving", true);
    setError(null);
    setNotice(null);
    try {
      const form = providerForms[providerId];
      const providerConfig = config.providers.find((p) => p.provider === providerId);
      await updateAiProviderConfig(providerId, {
        model: form.model || null,
        apiKey: form.apiKey || null,
        baseUrl: form.baseUrl || null,
        expectedVersion: providerConfig.version,
      });
      setNotice(`${providerId} configuration saved.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProviderField(providerId, "saving", false);
    }
  }

  if (loading) return <p className="page-intro">Loading...</p>;

  return (
    <div>
      <div className="page-header">
        <h1>AI Control Center</h1>
      </div>
      <p className="page-intro">
        Configure the AI provider SarkariTaiyaari&apos;s backend talks to — no code change
        or redeploy needed for a normal change. Nothing here is a live student feature yet;
        this only makes the already-built AI foundation administrable. An API key is never
        shown once saved, never sent to a browser after that, and never reaches the mobile
        app — the backend is the only thing that ever talks to a provider.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-success">{notice}</div>}

      {config && (
        <>
          <div className="toolbar">
            <span className={`badge ${config.settings.enabled ? "badge-easy" : "badge-hard"}`}>
              AI {config.settings.enabled ? "Enabled" : "Disabled"}
            </span>
            <span className="badge badge-medium">Provider: {config.settings.activeProvider || "—"}</span>
          </div>

          <form onSubmit={handleSaveSettings} style={{ marginTop: 16 }}>
            <div className="form-row">
              <div className="form-field">
                <label>AI Enabled</label>
                <select
                  value={settingsForm.enabled ? "true" : "false"}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, enabled: e.target.value === "true" }))}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div className="form-field">
                <label>Active Provider</label>
                <select
                  value={settingsForm.activeProvider}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, activeProvider: e.target.value }))}
                >
                  <option value="">(use default)</option>
                  {config.availableProviders.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </form>

          <h2 style={{ marginTop: 32 }}>Providers</h2>
          <p className="field-note">
            Only providers actually registered on the backend appear here — there is no way
            to configure one that doesn&apos;t exist.
          </p>
          {config.providers.map((p) => {
            const form = providerForms[p.provider] || {};
            return (
              <div key={p.provider} className="table-wrap" style={{ padding: 16, marginTop: 12 }}>
                <h3>{p.provider}</h3>
                <div className="toolbar">
                  <span className={`badge ${p.configured ? "badge-easy" : "badge-hard"}`}>
                    {p.configured ? "Configured ✓" : "Not configured"}
                  </span>
                  <span className={`badge ${TEST_STATUS_BADGE[p.lastTestStatus] || "badge-medium"}`}>
                    Connection:{" "}
                    {p.lastTestStatus === "SUCCESS" && "Healthy ✓"}
                    {p.lastTestStatus === "FAILED" && "Failed ✕"}
                    {(!p.lastTestStatus || p.lastTestStatus === "NOT_TESTED") && "Not tested yet"}
                  </span>
                </div>
                <p className="field-note">
                  Last updated {fmtDate(p.updatedAt)}
                  {p.updatedByEmail ? ` by ${p.updatedByEmail}` : ""} · Last tested {fmtDate(p.lastTestAt)}
                  {p.lastTestLatencyMs != null ? ` (${p.lastTestLatencyMs}ms)` : ""}
                </p>

                <form onSubmit={(e) => handleSaveProvider(p.provider, e)}>
                  <div className="form-row">
                    <div className="form-field">
                      <label>Model</label>
                      {form.models ? (
                        <select
                          value={form.model}
                          onChange={(e) => setProviderField(p.provider, "model", e.target.value)}
                        >
                          <option value="">(use default)</option>
                          {form.models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.displayName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={form.model}
                          placeholder={p.model || "(provider default)"}
                          onChange={(e) => setProviderField(p.provider, "model", e.target.value)}
                        />
                      )}
                      <button type="button" className="btn btn-sm" onClick={() => handleLoadModels(p.provider)}>
                        Load models from provider
                      </button>
                      {form.modelsError && (
                        <div className="field-note">Could not load models: {form.modelsError}</div>
                      )}
                    </div>
                    <div className="form-field">
                      <label>API Key</label>
                      <input
                        type="password"
                        value={form.apiKey}
                        placeholder={p.configured ? "unchanged" : "not configured"}
                        onChange={(e) => setProviderField(p.provider, "apiKey", e.target.value)}
                        autoComplete="new-password"
                      />
                      <div className="field-note">
                        {p.configured ? "Configured ✓ — leave blank to keep the current key" : "Not configured"}
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Base URL (optional)</label>
                      <input
                        type="text"
                        value={form.baseUrl}
                        placeholder={p.baseUrlConfigured ? "configured — leave blank to keep" : "(provider default)"}
                        onChange={(e) => setProviderField(p.provider, "baseUrl", e.target.value)}
                      />
                    </div>
                  </div>

                  {form.testResult && (
                    <div className={`banner ${form.testResult.success ? "banner-success" : "banner-error"}`}>
                      {form.testResult.success
                        ? `✓ Connection successful — model ${form.testResult.model}, ${form.testResult.latencyMs}ms`
                        : `✕ Connection failed — ${form.testResult.message}`}
                    </div>
                  )}

                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={form.testing}
                      onClick={() => handleTestConnection(p.provider)}
                    >
                      {form.testing ? "Testing..." : "Test Connection"}
                    </button>
                    <button className="btn btn-primary" type="submit" disabled={form.saving}>
                      {form.saving ? "Saving..." : "Save Provider Configuration"}
                    </button>
                  </div>
                </form>
              </div>
            );
          })}

          <h2 style={{ marginTop: 32 }}>AI Tasks</h2>
          <p className="page-intro">
            Per-task enable/disable, independent of the provider config above. A task with no
            row here has never been toggled and defaults to disabled — the same
            &quot;unknown means off&quot; rule the router and the mobile app both follow.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {taskFlags.map((flag) => (
                  <tr key={flag.taskId}>
                    <td>{flag.taskId}</td>
                    <td>
                      <span className={`badge ${flag.enabled ? "badge-easy" : "badge-hard"}`}>
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      {fmtDate(flag.updatedAt)}
                      {flag.updatedByEmail ? ` by ${flag.updatedByEmail}` : ""}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={savingTaskId === flag.taskId}
                        onClick={() => handleToggleTask(flag.taskId, !flag.enabled, flag.version)}
                      >
                        {savingTaskId === flag.taskId ? "Saving..." : flag.enabled ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 32 }}>Usage</h2>
          <p className="page-intro">
            Every AI call is recorded to the database and aggregated by feature and model —
            see <Link to="/ai-usage">AI Usage</Link> for token counts and failures. Calls are
            still written to the application log as well, which is what makes a single call
            traceable line by line.
          </p>

          <h2 style={{ marginTop: 32 }}>Audit Log</h2>
          {auditLog.length === 0 ? (
            <p className="page-intro">No configuration changes recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Provider</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={i}>
                      <td>{fmtDate(entry.changedAt)}</td>
                      <td>{entry.changedByEmail}</td>
                      <td>{entry.action}</td>
                      <td>{entry.provider || "—"}</td>
                      <td>{entry.summary}</td>
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
