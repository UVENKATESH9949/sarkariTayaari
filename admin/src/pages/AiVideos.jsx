import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLessonBlueprint,
  deleteLessonVideo,
  getLessonBlueprints,
  getLessonVideos,
  listSubjects,
  listTopics,
  publishLessonVideo,
  unpublishLessonVideo,
  uploadLessonVideo,
} from "../api.js";

/**
 * AI Videos — upload a lesson rendered by the AI Video Studio and link it to real content.
 *
 * The studio is a separate repository with no API: it renders through its own CLI into
 * `output/<lesson-id>.mp4` and describes what it produced in `library/library.json`. So the
 * integration point is an upload, not a call, and this form is deliberately shaped like that
 * export — pick the topic, attach the MP4, optionally paste the lesson JSON as the blueprint.
 *
 * Structured like `AiContentReview.jsx`: one card per row with every field visible, and a reload
 * after any mutation rather than optimistic local state, so what is on screen is what the server
 * actually holds.
 */

const STATUS_BADGE = { DRAFT: "badge-lang", REVIEW: "badge-medium", PUBLISHED: "badge-easy" };
const READY_BADGE = {
  READY: "badge-easy",
  PROCESSING: "badge-medium",
  GENERATING: "badge-medium",
  QUEUED: "badge-medium",
  FAILED: "badge-hard",
  ARCHIVED: "badge-lang",
};

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes) {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadForm({ topics, onUploaded }) {
  const [topicId, setTopicId] = useState("");
  const [language, setLanguage] = useState("en");
  const [level, setLevel] = useState("STANDARD");
  const [premium, setPremium] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState("");
  const [file, setFile] = useState(null);
  const [lessonJson, setLessonJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!topicId) {
      setError("Choose the topic this lesson teaches.");
      return;
    }
    if (!file) {
      setError("Attach the rendered MP4.");
      return;
    }

    let blueprintId = null;
    setBusy(true);
    try {
      // The blueprint is optional. When the studio lesson JSON is pasted, store it first so the
      // video can point back at the teaching content it was rendered from.
      if (lessonJson.trim()) {
        let payload;
        try {
          payload = JSON.parse(lessonJson);
        } catch {
          throw new Error("The lesson JSON is not valid JSON.");
        }
        const blueprint = await createLessonBlueprint({
          topicId,
          language,
          teachingLevel: level,
          source: "IMPORTED",
          payload,
        });
        blueprintId = blueprint.id;
      }

      await uploadLessonVideo(file, {
        topicId,
        blueprintId,
        language,
        level,
        premium,
        durationSeconds: durationSeconds || null,
      });

      setNotice("Uploaded. It is a draft until you publish it.");
      setFile(null);
      setLessonJson("");
      setDurationSeconds("");
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Upload a lesson video</h2>
      <p className="page-intro">
        Render the lesson in the AI Video Studio, then upload the MP4 from its{" "}
        <code>output/</code> folder here. Pasting the matching{" "}
        <code>lessons/&lt;id&gt;.json</code> stores the teaching blueprint alongside it.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner">{notice}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="video-topic">Topic</label>
            <select
              id="video-topic"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">Select a topic…</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subjectName ? `${t.subjectName} — ${t.name}` : t.name}
                </option>
              ))}
            </select>
            <p className="field-note">
              Students watching this from a question get it through the question&apos;s topic.
            </p>
          </div>

          <div className="form-field">
            <label htmlFor="video-language">Language</label>
            <select id="video-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">en</option>
              <option value="hi">hi</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="video-level">Teaching level</label>
            <select id="video-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="BEGINNER">Beginner</option>
              <option value="STANDARD">Standard</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="video-file">Video file (MP4)</label>
            <input
              id="video-file"
              type="file"
              accept="video/mp4"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="field-note">Up to 20MB. Studio lessons are typically 7–9MB.</p>
          </div>

          <div className="form-field">
            <label htmlFor="video-duration">Duration (seconds)</label>
            <input
              id="video-duration"
              type="number"
              min="1"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              placeholder="126"
            />
            <p className="field-note">
              From <code>durationSeconds</code> in the studio&apos;s library.json.
            </p>
          </div>

          <div className="form-field">
            <label htmlFor="video-premium">Premium</label>
            <select
              id="video-premium"
              value={premium ? "yes" : "no"}
              onChange={(e) => setPremium(e.target.value === "yes")}
            >
              <option value="no">Free for everyone</option>
              <option value="yes">Premium only</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="video-lesson-json">Lesson JSON (optional)</label>
          <textarea
            id="video-lesson-json"
            rows={6}
            value={lessonJson}
            onChange={(e) => setLessonJson(e.target.value)}
            placeholder='Paste the contents of lessons/<id>.json'
          />
          <p className="field-note">
            Stored as the teaching blueprint. It is what a future text or interactive lesson would
            be built from, so it is worth keeping even though only the video uses it today.
          </p>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>
    </div>
  );
}

function VideoCard({ video, topicName, blueprint, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(action) {
    setError(null);
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <h3>{topicName ?? video.topicId ?? video.questionId}</h3>
        <div>
          <span className={`badge ${STATUS_BADGE[video.contentStatus] ?? "badge-lang"}`}>
            {video.contentStatus}
          </span>{" "}
          <span className={`badge ${READY_BADGE[video.status] ?? "badge-lang"}`}>{video.status}</span>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <table>
        <tbody>
          <tr>
            <th>Language / level</th>
            <td>
              {video.languageCode} / {video.teachingLevel} / {video.quality}
            </td>
          </tr>
          <tr>
            <th>Version</th>
            <td>
              v{video.contentVersion}
              {video.contentVersion > 1 && (
                <span className="field-note">
                  {" "}
                  — earlier versions stay on devices until they re-check
                </span>
              )}
            </td>
          </tr>
          <tr>
            <th>Duration / size</th>
            <td>
              {formatDuration(video.durationSeconds)} · {formatSize(video.sizeBytes)}
            </td>
          </tr>
          <tr>
            <th>Source</th>
            <td>{video.source}</td>
          </tr>
          <tr>
            <th>Blueprint</th>
            <td>
              {blueprint
                ? `${blueprint.studioLessonId ?? blueprint.id} (${blueprint.schemaVersion})`
                : "None attached"}
            </td>
          </tr>
          <tr>
            <th>Premium</th>
            <td>{video.premium ? "Premium only" : "Free for everyone"}</td>
          </tr>
          <tr>
            <th>Checksum</th>
            <td>
              <code>{video.checksumSha256 ? video.checksumSha256.slice(0, 16) + "…" : "—"}</code>
            </td>
          </tr>
          {video.errorMessage && (
            <tr>
              <th>Error</th>
              <td>{video.errorMessage}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="row-actions">
        {video.contentStatus !== "PUBLISHED" ? (
          <button
            className="btn btn-primary"
            disabled={busy || video.status !== "READY"}
            onClick={() => run(() => publishLessonVideo(video.id))}
          >
            {busy ? "Working…" : "Publish"}
          </button>
        ) : (
          <button
            className="btn"
            disabled={busy}
            onClick={() => run(() => unpublishLessonVideo(video.id))}
          >
            {busy ? "Working…" : "Unpublish"}
          </button>
        )}
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Delete this video? Students will stop seeing it immediately.")) {
              run(() => deleteLessonVideo(video.id));
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function AiVideos() {
  const [videos, setVideos] = useState([]);
  const [blueprints, setBlueprints] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Guards against an older, slower response overwriting a newer one — the same race already
  // found and fixed once on AiContentReview.jsx.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [videoRows, blueprintRows] = await Promise.all([
        getLessonVideos(),
        getLessonBlueprints(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setVideos(videoRows);
      setBlueprints(blueprintRows);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [topicRows, subjectRows] = await Promise.all([listTopics(), listSubjects()]);
        if (cancelled) return;
        const subjectsById = new Map(subjectRows.map((s) => [s.id, s.name]));
        setTopics(
          topicRows.map((t) => ({ ...t, subjectName: subjectsById.get(t.subjectId) })),
        );
      } catch {
        // A failed topic list only costs the picker its labels; the page still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const topicNames = new Map(topics.map((t) => [t.id, t.subjectName ? `${t.subjectName} — ${t.name}` : t.name]));
  const blueprintsById = new Map(blueprints.map((b) => [b.id, b]));

  return (
    <div>
      <div className="page-header">
        <h1>AI Videos</h1>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>

      <p className="page-intro">
        Lessons rendered by the AI Video Studio. A video is a draft until it is published, so it
        can be watched here before any student sees it. Students reach a topic lesson from any
        question on that topic.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <UploadForm topics={topics} onUploaded={load} />

      <h2>Uploaded videos</h2>
      {loading && videos.length === 0 && <div className="empty-state">Loading…</div>}
      {!loading && videos.length === 0 && (
        <div className="empty-state">No videos yet. Upload one above.</div>
      )}
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          topicName={topicNames.get(video.topicId)}
          blueprint={video.blueprintId ? blueprintsById.get(video.blueprintId) : null}
          onChanged={load}
        />
      ))}
    </div>
  );
}
