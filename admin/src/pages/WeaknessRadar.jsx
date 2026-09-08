import { Fragment, useEffect, useState } from "react";
import { listAllExams, inspectWeaknessRadar } from "../api.js";

/**
 * Weakness Radar observability (TASK-2201, supplied spec §22).
 *
 * Exists for one specific situation §22 names: a student asks "why does the app say I'm weak in
 * this topic?" and someone has to be able to answer from stored evidence rather than by
 * guessing. So this shows the full working — attempt counts, historical versus recent accuracy,
 * PYQ accuracy, consistency, the speed signal's absence, health, confidence, priority, the
 * resolved state, the recommended action, and the algorithm version behind all of it.
 *
 * Read-only, deliberately. There is no override here and no recompute button, unlike the Topic
 * Priority page next to it: topic health is entirely derived from a student's own attempts, so
 * the only honest way to change it is for them to practise. An editorial override on a personal
 * diagnosis would be a different feature with a much harder case to make.
 *
 * It also never triggers a recompute server-side — an admin investigating a complaint needs to
 * see what the student was actually served, not a fresh answer that may no longer show the
 * problem.
 */

const STATE_LABEL = {
  INSUFFICIENT_DATA: "Not enough data",
  DEVELOPING: "Developing",
  STRONG: "Strong",
  NEEDS_ATTENTION: "Needs attention",
  NEEDS_REVISION: "Needs revision",
  IMPROVING: "Improving",
};

/** Numbers arrive as strings or numbers depending on JSON serialisation; normalise for display. */
function fmt(value, suffix = "") {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return `${n.toFixed(2)}${suffix}`;
}

/** An em dash, not a zero — "not measured" and "measured as zero" are different facts. */
function orDash(value) {
  return value === null || value === undefined ? "—" : value;
}

export default function WeaknessRadar() {
  const [exams, setExams] = useState([]);
  const [examCode, setExamCode] = useState("");
  const [email, setEmail] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    listAllExams()
      .then((rows) => {
        const sorted = [...rows].sort((a, b) => a.displayOrder - b.displayOrder);
        setExams(sorted);
        if (sorted.length > 0) setExamCode((prev) => prev || sorted[0].code);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function inspect() {
    if (!email.trim() || !examCode) return;
    setLoading(true);
    setError(null);
    setData(null);
    setExpanded(null);
    try {
      setData(await inspectWeaknessRadar(email.trim(), examCode));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const topics = data?.topics ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Weakness Radar</h1>
      </div>

      <p className="page-intro">
        The evidence behind one student&apos;s Preparation Radar, at full precision — including the
        confidence figure the app deliberately never shows them. Health is computed from their own
        question attempts, so there is nothing to edit here; if a diagnosis looks wrong, the
        answer is in these numbers.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="toolbar">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") inspect();
          }}
          placeholder="student@example.com"
        />
        <select value={examCode} onChange={(e) => setExamCode(e.target.value)}>
          {exams.map((exam) => (
            <option key={exam.code} value={exam.code}>
              {exam.name} ({exam.code})
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={inspect} disabled={loading || !email.trim()}>
          {loading ? "Loading..." : "Inspect"}
        </button>
      </div>

      {data && (
        <>
          <p className="page-intro">
            Algorithm <strong>{data.algorithmVersion}</strong> ·{" "}
            {topics.length} topic(s) with stored health ·{" "}
            {data.latestAttemptAt
              ? `last attempt ${new Date(data.latestAttemptAt).toLocaleString()}`
              : "no attempts on record"}
          </p>

          {topics.length === 0 ? (
            <p className="page-intro">
              Nothing stored for this student and exam yet. Either they have not practised any of
              this exam&apos;s topics, or they have never opened their radar — health is computed
              on read, so a student who has never looked has no rows.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                <tr>
                  <th>Topic</th>
                  <th>State</th>
                  <th>Health</th>
                  <th>Confidence</th>
                  <th>Evidence</th>
                  <th>Answered</th>
                  <th>Recent → earlier</th>
                  <th>PYQ</th>
                  <th>Priority</th>
                  <th>Value</th>
                  <th>Action</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {topics.map((topic) => (
                  <Fragment key={topic.topicId}>
                    <tr>
                      <td>
                        <strong>{topic.topicName}</strong>
                        <div className="cell-secondary">{topic.subjectName}</div>
                      </td>
                      <td>{STATE_LABEL[topic.state] ?? topic.state}</td>
                      <td>{orDash(fmt(topic.healthScore))}</td>
                      {/*
                        Shown here and only here. §11 keeps confidence out of the student-facing
                        payload entirely; this page is where §22 wants it, because it is the
                        number that explains why a verdict was or was not asserted.
                      */}
                      <td>{orDash(fmt(topic.confidenceScore))}</td>
                      <td>{topic.evidenceLevel}</td>
                      <td>
                        {topic.correctCount}/{topic.attemptedCount}
                      </td>
                      <td>
                        {orDash(fmt(topic.recentAccuracy, "%"))} ←{" "}
                        {orDash(fmt(topic.historicalAccuracy, "%"))}
                        <div className="cell-secondary">
                          {topic.trend}
                          {topic.trendDelta !== null && topic.trendDelta !== undefined
                            ? ` ${fmt(topic.trendDelta)}pp`
                            : ""}
                        </div>
                      </td>
                      <td>
                        {orDash(fmt(topic.pyqAccuracy, "%"))}
                        <div className="cell-secondary">{topic.pyqAttemptedCount} answered</div>
                      </td>
                      <td>{orDash(fmt(topic.priority))}</td>
                      <td>{orDash(topic.interventionValue)}</td>
                      <td>
                        {topic.recommendedAction}
                        <div className="cell-secondary">{(topic.reasonCodes ?? []).join(", ")}</div>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            setExpanded(expanded === topic.topicId ? null : topic.topicId)
                          }
                        >
                          {expanded === topic.topicId ? "Hide working" : "Working"}
                        </button>
                      </td>
                    </tr>
                    {expanded === topic.topicId && (
                      <tr>
                        <td colSpan={12}>
                          <div className="cell-secondary" style={{ marginBottom: 8 }}>
                            Consistency {orDash(fmt(topic.consistencyScore))} · Speed{" "}
                            {/*
                              Rendered as absent on purpose. There is no expected-time benchmark
                              in this schema, so §9 forbids computing a ratio at all — a blank
                              here would let a reader assume it simply had not been looked at.
                            */}
                            {topic.speedRatio === null || topic.speedRatio === undefined
                              ? "not measured (no expected-time benchmark exists)"
                              : fmt(topic.speedRatio, "x")}{" "}
                            · Evidence through{" "}
                            {topic.evidenceThroughAt
                              ? new Date(topic.evidenceThroughAt).toLocaleString()
                              : "—"}{" "}
                            · Computed{" "}
                            {topic.computedAt ? new Date(topic.computedAt).toLocaleString() : "—"}
                          </div>
                          {/*
                            The stored `inputs` blob verbatim: every component score and the
                            weight actually applied to it after renormalisation, plus which
                            components were dropped and why. This is the artefact that makes the
                            §22 question answerable without re-running anything.
                          */}
                          <pre
                            style={{
                              margin: 0,
                              fontSize: 11.5,
                              lineHeight: 1.5,
                              overflowX: "auto",
                              whiteSpace: "pre",
                            }}
                          >
                            {JSON.stringify(topic.inputs ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
