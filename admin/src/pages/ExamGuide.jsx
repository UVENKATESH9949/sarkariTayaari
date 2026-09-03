import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  listRecruitmentCycles,
  createRecruitmentCycle,
  updateRecruitmentCycle,
  deleteRecruitmentCycle,
  submitCycleForReview,
  rejectRecruitmentCycle,
  publishRecruitmentCycle,
  unpublishRecruitmentCycle,
  listExamSources,
  getEligibilityRule,
  upsertEligibilityRule,
  listImportantDates,
  createImportantDate,
  updateImportantDate,
  deleteImportantDate,
  listDocumentRequirements,
  createDocumentRequirement,
  updateDocumentRequirement,
  deleteDocumentRequirement,
  listApplicationSteps,
  createApplicationStep,
  updateApplicationStep,
  deleteApplicationStep,
  listApplicationMistakes,
  createApplicationMistake,
  updateApplicationMistake,
  deleteApplicationMistake,
  listFeeRules,
  createFeeRule,
  updateFeeRule,
  deleteFeeRule,
  listCareerPosts,
  createCareerPost,
  updateCareerPost,
  deleteCareerPost,
} from "../api.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import SectionTable from "../components/SectionTable.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const CYCLE_STATUSES = [
  "NOT_ANNOUNCED", "NOTIFICATION_EXPECTED", "NOTIFICATION_RELEASED", "APPLICATION_OPEN",
  "APPLICATION_CLOSING_SOON", "APPLICATION_CLOSED", "CORRECTION_WINDOW_OPEN", "ADMIT_CARD_RELEASED",
  "EXAM_UPCOMING", "EXAM_ONGOING", "ANSWER_KEY_RELEASED", "RESULT_RELEASED", "CUTOFF_RELEASED",
  "FINAL_RESULT", "RECRUITMENT_COMPLETED",
];
const EVENT_TYPES = [
  "NOTIFICATION", "APPLICATION_START", "APPLICATION_END", "CORRECTION_WINDOW",
  "ADMIT_CARD", "EXAM_STAGE", "ANSWER_KEY", "RESULT", "FINAL_RESULT",
];
const DOCUMENT_LEVELS = [
  { code: "YES", label: "Required" },
  { code: "NO", label: "Not required" },
  { code: "IF_APPLICABLE", label: "If applicable" },
];
const FEE_CATEGORIES = ["GENERAL", "OBC", "SC", "ST", "FEMALE", "PWBD", "EX_SERVICEMEN"];

function statusLabel(status) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function numOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function sourceOptionLabel(source) {
  return source.sourceType === "ADMIN_ESTIMATE" ? `${source.sourceName} (estimate)` : source.sourceName;
}

/** Shared "which source backs this fact" dropdown — every dated/documented/fee fact can cite one. */
function SourceSelect({ value, onChange, sources }) {
  return (
    <div className="form-field">
      <label>Source</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">None</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>{sourceOptionLabel(s)}</option>
        ))}
      </select>
    </div>
  );
}

/* ============================================================ Recruitment cycle */

const BLANK_CYCLE = {
  cycleName: "", status: "NOT_ANNOUNCED", notificationDate: "", applicationStart: "", applicationEnd: "",
  examStart: "", examEnd: "", vacancyCount: "", notificationUrl: "", overviewText: "", current: false, demo: false,
  contentStatus: "DRAFT",
};

function CycleFormModal({ examCode, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      examCode,
      cycleName: form.cycleName.trim(),
      status: form.status,
      notificationDate: form.notificationDate || null,
      applicationStart: form.applicationStart || null,
      applicationEnd: form.applicationEnd || null,
      examStart: form.examStart || null,
      examEnd: form.examEnd || null,
      vacancyCount: numOrNull(form.vacancyCount),
      notificationUrl: form.notificationUrl.trim() || null,
      overviewText: form.overviewText.trim() || null,
      current: form.current,
      demo: form.demo,
      lastVerifiedAt: form.lastVerifiedAt || null,
      contentStatus: form.contentStatus,
    };
    try {
      if (form.id) await updateRecruitmentCycle(form.id, payload);
      else await createRecruitmentCycle(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial.id ? "Edit recruitment cycle" : "Add recruitment cycle"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.cycleName.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Cycle name</label>
            <input value={form.cycleName} onChange={(e) => set("cycleName", e.target.value)} placeholder="2027" autoFocus required />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {CYCLE_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Notification date</label>
            <input type="date" value={form.notificationDate ?? ""} onChange={(e) => set("notificationDate", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Vacancies</label>
            <input type="number" value={form.vacancyCount ?? ""} onChange={(e) => set("vacancyCount", e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Application opens</label>
            <input type="date" value={form.applicationStart ?? ""} onChange={(e) => set("applicationStart", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Application closes</label>
            <input type="date" value={form.applicationEnd ?? ""} onChange={(e) => set("applicationEnd", e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Exam starts</label>
            <input type="date" value={form.examStart ?? ""} onChange={(e) => set("examStart", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Exam ends</label>
            <input type="date" value={form.examEnd ?? ""} onChange={(e) => set("examEnd", e.target.value)} />
          </div>
        </div>

        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Official notification URL</label>
          <input value={form.notificationUrl ?? ""} onChange={(e) => set("notificationUrl", e.target.value)} placeholder="https://ssc.gov.in/..." />
        </div>

        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Overview (plain-language "what is this exam?")</label>
          <textarea
            value={form.overviewText ?? ""}
            onChange={(e) => set("overviewText", e.target.value)}
            placeholder="A short, plain-language summary of what this exam is and who it's for."
            rows={3}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="checkbox-field">
              <input type="checkbox" checked={form.current} onChange={(e) => set("current", e.target.checked)} />
              Current cycle
            </label>
            <span className="field-note">The one cycle mobile shows for this exam. Setting this un-sets any other current cycle for the exam.</span>
          </div>
          <div className="form-field">
            <label className="checkbox-field">
              <input type="checkbox" checked={form.demo} onChange={(e) => set("demo", e.target.checked)} />
              Demo / not backed by a real notification
            </label>
            <span className="field-note">Rendered as a visible "Demo" badge everywhere this cycle is shown — never hidden from users.</span>
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="form-field">
            <label>Content status</label>
            <select value={form.contentStatus} onChange={(e) => set("contentStatus", e.target.value)}>
              <option value="DRAFT">Draft (hidden from students)</option>
              <option value="REVIEW">In review (hidden from students)</option>
              <option value="PUBLISHED">Published (visible to students)</option>
            </select>
            <span className="field-note">Gates this cycle and everything under it — dates, eligibility, documents, fees. Prefer the Submit for review / Publish / Send back to draft buttons on the cycle list for the normal workflow; this dropdown is a direct override.</span>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ============================================================ Eligibility */

const BLANK_ELIGIBILITY = {
  minimumAge: "", maximumAge: "", ageCutoffDate: "", qualification: "", nationality: "",
  genderRequirement: "", specialRequirements: "", sourceId: null, categoryRelaxation: [],
};

function EligibilityForm({ cycleId, sources }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(null);
    setSaved(false);
    getEligibilityRule(cycleId).then((rule) => {
      if (!rule) {
        setForm(BLANK_ELIGIBILITY);
        return;
      }
      setForm({
        minimumAge: rule.minimumAge ?? "", maximumAge: rule.maximumAge ?? "",
        ageCutoffDate: rule.ageCutoffDate ?? "", qualification: rule.qualification ?? "",
        nationality: rule.nationality ?? "", genderRequirement: rule.genderRequirement ?? "",
        specialRequirements: rule.specialRequirements ?? "", sourceId: rule.sourceId ?? null,
        categoryRelaxation: Object.entries(rule.categoryRelaxation ?? {}).map(([category, years]) => ({ category, years: String(years) })),
      });
    });
  }, [cycleId]);

  if (!form) return <p>Loading...</p>;

  const set = (field, value) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  function addRelaxationRow() {
    set("categoryRelaxation", [...form.categoryRelaxation, { category: "", years: "" }]);
  }
  function updateRelaxationRow(index, field, value) {
    const rows = form.categoryRelaxation.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    set("categoryRelaxation", rows);
  }
  function removeRelaxationRow(index) {
    set("categoryRelaxation", form.categoryRelaxation.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const categoryRelaxation = {};
    for (const row of form.categoryRelaxation) {
      if (!row.category.trim()) continue;
      const years = Number(row.years);
      if (!Number.isNaN(years)) categoryRelaxation[row.category.trim().toUpperCase()] = years;
    }
    const payload = {
      minimumAge: numOrNull(form.minimumAge),
      maximumAge: numOrNull(form.maximumAge),
      ageCutoffDate: form.ageCutoffDate || null,
      qualification: form.qualification.trim() || null,
      nationality: form.nationality.trim() || null,
      genderRequirement: form.genderRequirement.trim() || null,
      categoryRelaxation: Object.keys(categoryRelaxation).length ? categoryRelaxation : null,
      specialRequirements: form.specialRequirements.trim() || null,
      sourceId: form.sourceId,
    };
    try {
      await upsertEligibilityRule(cycleId, payload);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2>Eligibility</h2>
      {error && <div className="banner banner-error">{error}</div>}
      {saved && <div className="banner banner-success">Saved.</div>}

      <div className="form-row">
        <div className="form-field">
          <label>Minimum age</label>
          <input type="number" value={form.minimumAge} onChange={(e) => set("minimumAge", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Maximum age</label>
          <input type="number" value={form.maximumAge} onChange={(e) => set("maximumAge", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Age computed as on</label>
          <input type="date" value={form.ageCutoffDate} onChange={(e) => set("ageCutoffDate", e.target.value)} />
        </div>
      </div>

      <div className="form-field" style={{ maxWidth: "none" }}>
        <label>Qualification</label>
        <textarea rows={2} value={form.qualification} onChange={(e) => set("qualification", e.target.value)} />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Nationality</label>
          <textarea rows={2} value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Gender requirement</label>
          <input value={form.genderRequirement} onChange={(e) => set("genderRequirement", e.target.value)} />
        </div>
      </div>

      <div className="form-field" style={{ maxWidth: "none" }}>
        <label>Age relaxation by category (years)</label>
        {form.categoryRelaxation.map((row, index) => (
          <div className="form-row" key={index} style={{ marginBottom: 8 }}>
            <input
              style={{ maxWidth: 160 }}
              value={row.category}
              onChange={(e) => updateRelaxationRow(index, "category", e.target.value)}
              placeholder="OBC"
            />
            <input
              type="number"
              style={{ maxWidth: 100 }}
              value={row.years}
              onChange={(e) => updateRelaxationRow(index, "years", e.target.value)}
              placeholder="3"
            />
            <button type="button" className="btn btn-ghost icon-btn" onClick={() => removeRelaxationRow(index)}>
              <TrashIcon />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={addRelaxationRow}>+ Add category</button>
      </div>

      <div className="form-field" style={{ maxWidth: "none" }}>
        <label>Special requirements</label>
        <textarea rows={2} value={form.specialRequirements} onChange={(e) => set("specialRequirements", e.target.value)} />
      </div>

      <SourceSelect value={form.sourceId} onChange={(v) => set("sourceId", v)} sources={sources} />

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save eligibility"}
        </button>
      </div>
    </section>
  );
}

/* ============================================================ Important dates */

const BLANK_DATE = { eventType: "NOTIFICATION", title: "", startDate: "", endDate: "", official: false, displayOrder: 0, sourceId: null };

function ImportantDateFormModal({ initial, sources, onCancel, onSaved, cycleId }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      eventType: form.eventType, title: form.title.trim(), startDate: form.startDate || null,
      endDate: form.endDate || null, official: form.official, displayOrder: Number(form.displayOrder) || 0,
      sourceId: form.sourceId,
    };
    try {
      if (form.id) await updateImportantDate(form.id, payload);
      else await createImportantDate(cycleId, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial.id ? "Edit date" : "Add date"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.title.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Event type</label>
            <select value={form.eventType} onChange={(e) => set("eventType", e.target.value)}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{statusLabel(t)}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Title</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Application closes" autoFocus required />
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>Start date</label>
            <input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="form-field">
            <label>End date</label>
            <input type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
            <span className="field-note">Leave blank for a single-day event.</span>
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>Display order</label>
            <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
          </div>
          <div className="form-field">
            <label className="checkbox-field">
              <input type="checkbox" checked={form.official} onChange={(e) => set("official", e.target.checked)} />
              Officially confirmed (unchecked = "Expected")
            </label>
          </div>
        </div>
        <SourceSelect value={form.sourceId} onChange={(v) => set("sourceId", v)} sources={sources} />
      </form>
    </Modal>
  );
}

/* ============================================================ Document requirements */

const BLANK_DOCUMENT = { documentName: "", required: "YES", applicableFor: "", format: "", maxSizeKb: "", dimensions: "", instructions: "", displayOrder: 0, sourceId: null };

function DocumentFormModal({ initial, sources, onCancel, onSaved, cycleId }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      documentName: form.documentName.trim(), required: form.required,
      applicableFor: form.applicableFor.trim() || null, format: form.format.trim() || null,
      maxSizeKb: numOrNull(form.maxSizeKb), dimensions: form.dimensions.trim() || null,
      instructions: form.instructions.trim() || null, displayOrder: Number(form.displayOrder) || 0,
      sourceId: form.sourceId,
    };
    try {
      if (form.id) await updateDocumentRequirement(form.id, payload);
      else await createDocumentRequirement(cycleId, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial.id ? "Edit document" : "Add document"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.documentName.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Document name</label>
            <input value={form.documentName} onChange={(e) => set("documentName", e.target.value)} placeholder="Photograph" autoFocus required />
          </div>
          <div className="form-field">
            <label>Required</label>
            <select value={form.required} onChange={(e) => set("required", e.target.value)}>
              {DOCUMENT_LEVELS.map((d) => (
                <option key={d.code} value={d.code}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>
        {form.required === "IF_APPLICABLE" && (
          <div className="form-field" style={{ maxWidth: "none" }}>
            <label>Applicable for</label>
            <input value={form.applicableFor} onChange={(e) => set("applicableFor", e.target.value)} placeholder="SC/ST/OBC candidates" />
          </div>
        )}
        <div className="form-row">
          <div className="form-field">
            <label>Format</label>
            <input value={form.format} onChange={(e) => set("format", e.target.value)} placeholder="JPEG" />
          </div>
          <div className="form-field">
            <label>Max size (KB)</label>
            <input type="number" value={form.maxSizeKb} onChange={(e) => set("maxSizeKb", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Dimensions</label>
            <input value={form.dimensions} onChange={(e) => set("dimensions", e.target.value)} placeholder="200x230 px" />
          </div>
        </div>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Instructions</label>
          <textarea rows={2} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Display order</label>
          <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
        </div>
        <SourceSelect value={form.sourceId} onChange={(v) => set("sourceId", v)} sources={sources} />
      </form>
    </Modal>
  );
}

/* ============================================================ Application steps */

const BLANK_STEP = { stepNumber: 1, title: "", description: "", warning: "", officialUrl: "" };

function ApplicationStepFormModal({ initial, onCancel, onSaved, cycleId }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      stepNumber: Number(form.stepNumber) || 1, title: form.title.trim(),
      description: form.description.trim() || null, warning: form.warning.trim() || null,
      officialUrl: form.officialUrl.trim() || null,
    };
    try {
      if (form.id) await updateApplicationStep(form.id, payload);
      else await createApplicationStep(cycleId, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial.id ? "Edit step" : "Add step"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.title.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Step number</label>
            <input type="number" value={form.stepNumber} onChange={(e) => set("stepNumber", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Title</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Upload photograph and signature" autoFocus required />
          </div>
        </div>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Description</label>
          <textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Warning</label>
          <textarea rows={2} value={form.warning} onChange={(e) => set("warning", e.target.value)} placeholder="Optional — a common mistake specific to this step" />
        </div>
        <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
          <label>Official URL</label>
          <input value={form.officialUrl} onChange={(e) => set("officialUrl", e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

/* ============================================================ Application mistakes */

const BLANK_MISTAKE = { mistake: "", displayOrder: 0 };

function ApplicationMistakeFormModal({ initial, onCancel, onSaved, cycleId }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = { mistake: form.mistake.trim(), displayOrder: Number(form.displayOrder) || 0 };
    try {
      if (form.id) await updateApplicationMistake(form.id, payload);
      else await createApplicationMistake(cycleId, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial.id ? "Edit mistake" : "Add mistake"}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.mistake.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Mistake</label>
          <input value={form.mistake} onChange={(e) => set("mistake", e.target.value)} placeholder="Incorrect date of birth" autoFocus required />
        </div>
        <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
          <label>Display order</label>
          <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

/* ============================================================ Fee rules */

const BLANK_FEE = { category: "GENERAL", amountRupees: 0, exempted: false, notes: "", displayOrder: 0, sourceId: null };

function FeeFormModal({ initial, sources, onCancel, onSaved, cycleId }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      category: form.category.trim().toUpperCase(), amountRupees: Number(form.amountRupees) || 0,
      exempted: form.exempted, notes: form.notes.trim() || null, displayOrder: Number(form.displayOrder) || 0,
      sourceId: form.sourceId,
    };
    try {
      if (form.id) await updateFeeRule(form.id, payload);
      else await createFeeRule(cycleId, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial.id ? "Edit fee" : "Add fee"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.category.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Category</label>
            <input value={form.category} onChange={(e) => set("category", e.target.value)} list="fee-categories" autoFocus required />
            <datalist id="fee-categories">
              {FEE_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="form-field">
            <label>Amount (₹)</label>
            <input type="number" value={form.amountRupees} onChange={(e) => set("amountRupees", e.target.value)} disabled={form.exempted} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.exempted}
                onChange={(e) => { set("exempted", e.target.checked); if (e.target.checked) set("amountRupees", 0); }}
              />
              Exempted (fee-free for this category)
            </label>
          </div>
          <div className="form-field">
            <label>Display order</label>
            <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
          </div>
        </div>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Notes</label>
          <input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <SourceSelect value={form.sourceId} onChange={(v) => set("sourceId", v)} sources={sources} />
      </form>
    </Modal>
  );
}

/* ============================================================ Career posts */

const BLANK_CAREER_POST = {
  postTitle: "", payLevel: "", salaryMinRupees: "", salaryMaxRupees: "", growthPath: "",
  description: "", sourceId: null, displayOrder: 0,
};

function CareerPostFormModal({ examCode, initial, sources, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      examCode,
      postTitle: form.postTitle.trim(),
      payLevel: form.payLevel.trim() || null,
      salaryMinRupees: numOrNull(form.salaryMinRupees),
      salaryMaxRupees: numOrNull(form.salaryMaxRupees),
      growthPath: form.growthPath.trim() || null,
      description: form.description.trim() || null,
      sourceId: form.sourceId,
      displayOrder: Number(form.displayOrder) || 0,
    };
    try {
      if (form.id) await updateCareerPost(form.id, payload);
      else await createCareerPost(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial.id ? "Edit career post" : "Add career post"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.postTitle.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Post title</label>
            <input value={form.postTitle} onChange={(e) => set("postTitle", e.target.value)} placeholder="Assistant Section Officer" autoFocus required />
          </div>
          <div className="form-field">
            <label>Pay level</label>
            <input value={form.payLevel} onChange={(e) => set("payLevel", e.target.value)} placeholder="Level 7 (₹44,900 - ₹1,42,400)" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>Salary min (₹/month)</label>
            <input type="number" value={form.salaryMinRupees} onChange={(e) => set("salaryMinRupees", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Salary max (₹/month)</label>
            <input type="number" value={form.salaryMaxRupees} onChange={(e) => set("salaryMaxRupees", e.target.value)} />
          </div>
          <div className="form-field">
            <label>Display order</label>
            <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
          </div>
        </div>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Description</label>
          <textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Career growth path</label>
          <textarea rows={3} value={form.growthPath} onChange={(e) => set("growthPath", e.target.value)} placeholder="Promoted to Section Officer after ~4-5 years, then..." />
        </div>
        <SourceSelect value={form.sourceId} onChange={(v) => set("sourceId", v)} sources={sources} />
      </form>
    </Modal>
  );
}

/* ============================================================ Page */

/**
 * Exam Guide Phase 1 admin console (see reports for the full audit/spec reference).
 *
 * One recruitment cycle at a time, selected from the list at the top — everything below
 * (eligibility, dates, documents, steps, mistakes, fees) belongs to that one cycle, which
 * mirrors the spec's own §33 "Information Versioning": nothing here is a fact about the
 * exam, everything is a fact about a specific year's cycle.
 */
export default function ExamGuide() {
  const { examCode } = useParams();
  const [cycles, setCycles] = useState([]);
  const [sources, setSources] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cycleEditor, setCycleEditor] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const [dates, setDates] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [steps, setSteps] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [fees, setFees] = useState([]);
  const [dateEditor, setDateEditor] = useState(null);
  const [documentEditor, setDocumentEditor] = useState(null);
  const [stepEditor, setStepEditor] = useState(null);
  const [mistakeEditor, setMistakeEditor] = useState(null);
  const [feeEditor, setFeeEditor] = useState(null);

  // Career posts (§25/§26) are exam-scoped, not cycle-scoped — loaded once per exam,
  // independent of which recruitment cycle is selected above.
  const [careerPosts, setCareerPosts] = useState([]);
  const [careerPostEditor, setCareerPostEditor] = useState(null);

  const loadCareerPosts = useCallback(() => {
    listCareerPosts(examCode).then(setCareerPosts).catch((e) => setError(e.message));
  }, [examCode]);

  useEffect(loadCareerPosts, [loadCareerPosts]);

  const loadCycles = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listRecruitmentCycles(examCode), listExamSources()])
      .then(([cycleRows, sourceRows]) => {
        setCycles(cycleRows);
        setSources(sourceRows);
        setSelectedCycleId((prev) => {
          if (prev && cycleRows.some((c) => c.id === prev)) return prev;
          return cycleRows.find((c) => c.current)?.id ?? cycleRows[0]?.id ?? null;
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [examCode]);

  useEffect(loadCycles, [loadCycles]);

  const loadCycleContent = useCallback(() => {
    if (!selectedCycleId) {
      setDates([]);
      setDocuments([]);
      setSteps([]);
      setMistakes([]);
      setFees([]);
      return;
    }
    listImportantDates(selectedCycleId).then(setDates).catch((e) => setError(e.message));
    listDocumentRequirements(selectedCycleId).then(setDocuments).catch((e) => setError(e.message));
    listApplicationSteps(selectedCycleId).then(setSteps).catch((e) => setError(e.message));
    listApplicationMistakes(selectedCycleId).then(setMistakes).catch((e) => setError(e.message));
    listFeeRules(selectedCycleId).then(setFees).catch((e) => setError(e.message));
  }, [selectedCycleId]);

  useEffect(loadCycleContent, [loadCycleContent]);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) ?? null;

  // Spec §36's three-state workflow: DRAFT -> REVIEW -> PUBLISHED, or REVIEW -> DRAFT
  // (reject). Each action call is wrapped the same way so a 403 (e.g. this admin session
  // isn't a REVIEWER) surfaces as the same inline error every other action here uses,
  // not a silent no-op.
  async function handleCycleContentAction(action, cycle) {
    try {
      await action(cycle.id);
      loadCycles();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteCycle(cycle) {
    const ok = await confirm(
      `Delete the "${cycle.cycleName}" cycle? This removes its eligibility, dates, documents, steps, mistakes and fees too — permanently.`,
      { title: "Delete recruitment cycle", confirmLabel: "Delete", danger: true },
    );
    if (!ok) return;
    try {
      await deleteRecruitmentCycle(cycle.id);
      loadCycles();
    } catch (err) {
      setError(deleteFailureMessage(err, "recruitment cycle"));
    }
  }

  async function handleDeleteRow(deleteFn, row, reload, label) {
    const ok = await confirm(`Delete this ${label}?`, { title: `Delete ${label}`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await deleteFn(row.id);
      reload();
    } catch (err) {
      setError(deleteFailureMessage(err, label));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Exam Guide — {examCode}</h1>
        <button className="btn btn-primary" onClick={() => setCycleEditor({ ...BLANK_CYCLE })}>
          Add recruitment cycle
        </button>
      </div>

      <p className="page-intro">
        Eligibility, dates, documents, fees and the application walkthrough for this exam — all scoped to
        one recruitment cycle at a time, since every one of those facts changes year to year. Selection
        process, exam pattern and syllabus live on the exam's Structure page instead; they don't change
        per cycle the way this content does.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Cycle</th>
                <th>Status</th>
                <th style={{ width: 90 }}>Current</th>
                <th style={{ width: 90 }}>Demo</th>
                <th style={{ width: 120 }}>Content</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.id} className={cycle.id === selectedCycleId ? "selected-row" : ""}>
                  <td>
                    <input type="radio" checked={cycle.id === selectedCycleId} onChange={() => setSelectedCycleId(cycle.id)} />
                  </td>
                  <td>
                    <button className="btn-link" onClick={() => setSelectedCycleId(cycle.id)}>{cycle.cycleName}</button>
                  </td>
                  <td>{statusLabel(cycle.status)}</td>
                  <td>{cycle.current && <span className="badge badge-easy">Current</span>}</td>
                  <td>{cycle.demo && <span className="badge badge-hard">Demo</span>}</td>
                  <td>
                    <div className="row-actions">
                      <span className={`badge ${cycle.contentStatus === "PUBLISHED" ? "badge-easy" : cycle.contentStatus === "REVIEW" ? "badge-medium" : "badge-hard"}`}>
                        {statusLabel(cycle.contentStatus)}
                      </span>
                      {cycle.contentStatus === "DRAFT" && (
                        <button className="btn btn-sm btn-primary" onClick={() => handleCycleContentAction(submitCycleForReview, cycle)}>
                          Submit for review
                        </button>
                      )}
                      {cycle.contentStatus === "REVIEW" && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => handleCycleContentAction(publishRecruitmentCycle, cycle)}>
                            Publish
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => handleCycleContentAction(rejectRecruitmentCycle, cycle)}>
                            Send back to draft
                          </button>
                        </>
                      )}
                      {cycle.contentStatus === "PUBLISHED" && (
                        <button className="btn btn-sm btn-ghost" onClick={() => handleCycleContentAction(unpublishRecruitmentCycle, cycle)}>
                          Unpublish
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost icon-btn" title="Edit" onClick={() => setCycleEditor({ ...cycle })}>
                        <EditIcon />
                      </button>
                      <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDeleteCycle(cycle)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {cycles.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">No recruitment cycles yet — add one to start building this exam's guide.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <SectionTable
        title="Career posts (not tied to a cycle)"
        addLabel="Add career post"
        onAdd={() => setCareerPostEditor({ ...BLANK_CAREER_POST })}
        columns={[
          { key: "postTitle", label: "Post" },
          { key: "payLevel", label: "Pay level", width: 200, render: (r) => r.payLevel ?? "—" },
          {
            key: "salary", label: "Salary range", width: 160,
            render: (r) => (r.salaryMinRupees || r.salaryMaxRupees)
              ? `₹${r.salaryMinRupees ?? "—"} - ₹${r.salaryMaxRupees ?? "—"}`
              : "—",
          },
        ]}
        rows={careerPosts}
        rowKey={(r) => r.id}
        onEdit={(r) => setCareerPostEditor({ ...r })}
        onDelete={(r) => handleDeleteRow(deleteCareerPost, r, loadCareerPosts, "career post")}
        emptyLabel="No career posts listed yet."
      />

      {selectedCycle && (
        <>
          <EligibilityForm cycleId={selectedCycle.id} sources={sources} />

          <SectionTable
            title="Important dates"
            addLabel="Add date"
            onAdd={() => setDateEditor({ ...BLANK_DATE })}
            columns={[
              { key: "eventType", label: "Type", width: 160, render: (r) => statusLabel(r.eventType) },
              { key: "title", label: "Title" },
              { key: "startDate", label: "Start", width: 110, render: (r) => r.startDate ?? "—" },
              { key: "endDate", label: "End", width: 110, render: (r) => r.endDate ?? "—" },
              { key: "official", label: "Status", width: 100, render: (r) => (r.official ? "Official" : "Expected") },
            ]}
            rows={dates}
            rowKey={(r) => r.id}
            onEdit={(r) => setDateEditor({ ...r })}
            onDelete={(r) => handleDeleteRow(deleteImportantDate, r, loadCycleContent, "date")}
            emptyLabel="No dates yet."
          />

          <SectionTable
            title="Documents"
            addLabel="Add document"
            onAdd={() => setDocumentEditor({ ...BLANK_DOCUMENT })}
            columns={[
              { key: "documentName", label: "Document" },
              { key: "required", label: "Required", width: 130, render: (r) => DOCUMENT_LEVELS.find((d) => d.code === r.required)?.label ?? r.required },
              { key: "format", label: "Format", width: 100, render: (r) => r.format ?? "—" },
              { key: "dimensions", label: "Dimensions", width: 130, render: (r) => r.dimensions ?? "—" },
            ]}
            rows={documents}
            rowKey={(r) => r.id}
            onEdit={(r) => setDocumentEditor({ ...r })}
            onDelete={(r) => handleDeleteRow(deleteDocumentRequirement, r, loadCycleContent, "document")}
            emptyLabel="No documents yet."
          />

          <SectionTable
            title="Application steps"
            addLabel="Add step"
            onAdd={() => setStepEditor({ ...BLANK_STEP, stepNumber: steps.length + 1 })}
            columns={[
              { key: "stepNumber", label: "#", width: 50 },
              { key: "title", label: "Title" },
              { key: "warning", label: "Warning", render: (r) => r.warning ?? "—" },
            ]}
            rows={steps}
            rowKey={(r) => r.id}
            onEdit={(r) => setStepEditor({ ...r })}
            onDelete={(r) => handleDeleteRow(deleteApplicationStep, r, loadCycleContent, "step")}
            emptyLabel="No steps yet."
          />

          <SectionTable
            title="Common application mistakes"
            addLabel="Add mistake"
            onAdd={() => setMistakeEditor({ ...BLANK_MISTAKE, displayOrder: mistakes.length })}
            columns={[{ key: "mistake", label: "Mistake" }]}
            rows={mistakes}
            rowKey={(r) => r.id}
            onEdit={(r) => setMistakeEditor({ ...r })}
            onDelete={(r) => handleDeleteRow(deleteApplicationMistake, r, loadCycleContent, "mistake")}
            emptyLabel="No mistakes listed yet."
          />

          <SectionTable
            title="Application fees"
            addLabel="Add fee"
            onAdd={() => setFeeEditor({ ...BLANK_FEE })}
            columns={[
              { key: "category", label: "Category", width: 160 },
              { key: "amountRupees", label: "Amount", width: 110, render: (r) => (r.exempted ? "Exempted" : `₹${r.amountRupees}`) },
              { key: "notes", label: "Notes", render: (r) => r.notes ?? "—" },
            ]}
            rows={fees}
            rowKey={(r) => r.id}
            onEdit={(r) => setFeeEditor({ ...r })}
            onDelete={(r) => handleDeleteRow(deleteFeeRule, r, loadCycleContent, "fee")}
            emptyLabel="No fees set yet."
          />
        </>
      )}

      {cycleEditor && (
        <CycleFormModal
          examCode={examCode}
          initial={cycleEditor}
          onCancel={() => setCycleEditor(null)}
          onSaved={() => {
            setCycleEditor(null);
            loadCycles();
          }}
        />
      )}
      {dateEditor && (
        <ImportantDateFormModal
          initial={dateEditor}
          sources={sources}
          cycleId={selectedCycleId}
          onCancel={() => setDateEditor(null)}
          onSaved={() => {
            setDateEditor(null);
            loadCycleContent();
          }}
        />
      )}
      {documentEditor && (
        <DocumentFormModal
          initial={documentEditor}
          sources={sources}
          cycleId={selectedCycleId}
          onCancel={() => setDocumentEditor(null)}
          onSaved={() => {
            setDocumentEditor(null);
            loadCycleContent();
          }}
        />
      )}
      {stepEditor && (
        <ApplicationStepFormModal
          initial={stepEditor}
          cycleId={selectedCycleId}
          onCancel={() => setStepEditor(null)}
          onSaved={() => {
            setStepEditor(null);
            loadCycleContent();
          }}
        />
      )}
      {mistakeEditor && (
        <ApplicationMistakeFormModal
          initial={mistakeEditor}
          cycleId={selectedCycleId}
          onCancel={() => setMistakeEditor(null)}
          onSaved={() => {
            setMistakeEditor(null);
            loadCycleContent();
          }}
        />
      )}
      {feeEditor && (
        <FeeFormModal
          initial={feeEditor}
          sources={sources}
          cycleId={selectedCycleId}
          onCancel={() => setFeeEditor(null)}
          onSaved={() => {
            setFeeEditor(null);
            loadCycleContent();
          }}
        />
      )}

      {careerPostEditor && (
        <CareerPostFormModal
          examCode={examCode}
          initial={careerPostEditor}
          sources={sources}
          onCancel={() => setCareerPostEditor(null)}
          onSaved={() => {
            setCareerPostEditor(null);
            loadCareerPosts();
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}
