// Seeds a realistic practice/mock-test history for a single, real, lasting demo
// account (not disposable test junk) — so signing into it on a phone shows the app
// populated like a real, used product. Uploads via the same POST /api/progress/sync
// path the app itself uses (see ProgressSyncTest.java), not a raw DB insert.
//
// Usage: node scripts/generate-demo-history.js <adminToken>

const BASE = "http://localhost:8080";
const ADMIN_TOKEN = process.argv[2];
if (!ADMIN_TOKEN) {
  console.error("Usage: node generate-demo-history.js <adminToken>");
  process.exit(1);
}

const DEMO_EMAIL = "demo@sarkaritaiyaari.app";
const DEMO_PASSWORD = "Demo@1234";
// Second pass (2026-08-19): adds this many *more* sessions/attempts on top of the
// existing 100/25 — every session/attempt gets a fresh crypto.randomUUID() id, so
// re-running this script is additive, not a replace, same as the question generator.
const PRACTICE_SESSION_COUNT = 250;
const MOCK_ATTEMPT_COUNT = 60;
const HISTORY_WEEKS = 16;

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function groupBy(arr, fn) {
  const m = {};
  for (const item of arr) (m[fn(item)] ??= []).push(item);
  return m;
}
function randomPastDate(weeks) {
  const now = Date.now();
  return new Date(now - rand(0, weeks * 7 * 24 * 60 * 60 * 1000));
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}
async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function signUpOrLogInDemo() {
  const registerRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, displayName: "Demo Student" }),
  });
  if (registerRes.ok) {
    console.log("Created demo account:", DEMO_EMAIL);
    return (await registerRes.json()).token;
  }
  console.log("Demo account already exists, signing in instead.");
  const auth = await post("/api/auth/login", { email: DEMO_EMAIL, password: DEMO_PASSWORD });
  return auth.token;
}

/** All active exams' full structure — same call the mobile app makes on sync. */
async function getMockablePapers() {
  const structures = await get("/api/exam-structures");
  const papers = [];
  for (const exam of structures) {
    for (const stage of exam.stages) {
      for (const paper of stage.papers) {
        if (paper.mockable && paper.sections.length > 0) {
          papers.push({ examCode: exam.examCode, examLabel: exam.examName, paper });
        }
      }
    }
  }
  return papers;
}

/** A pool of real questions per subject, pulled from the admin list endpoint (paged, filtered). */
async function buildQuestionPoolsBySubject() {
  const subjects = (await get("/api/subjects")).filter((s) => s.name !== "Automated Test Subject");
  const pools = {};
  for (const subject of subjects) {
    const page = await get(`/api/questions?subjectId=${subject.id}&size=300`, ADMIN_TOKEN);
    pools[subject.name] = page.content;
    console.log(`  pool: ${subject.name} -> ${page.content.length} candidate questions`);
  }
  return pools;
}

function buildPracticeSession(subjectName, questionsForSubject) {
  const byTopic = groupBy(questionsForSubject, (q) => q.topicName);
  const topicNames = Object.keys(byTopic).filter((t) => byTopic[t].length >= 4);
  if (topicNames.length === 0) return null;
  const topicName = pick(topicNames);
  const candidates = byTopic[topicName];
  const count = Math.min(rand(5, 20), candidates.length);
  const chosen = shuffle(candidates).slice(0, count);

  let correctCount = 0;
  const results = chosen.map((q, i) => {
    const correctIndex = "ABCD".indexOf(q.correctAnswer);
    const gotItRight = Math.random() < 0.72; // realistic-ish accuracy, not a perfect student
    const selectedIndex = gotItRight ? correctIndex : (correctIndex + 1 + rand(0, 2)) % 4;
    if (gotItRight) correctCount++;
    return { orderIndex: i, questionId: q.id, selectedIndex, correctIndex, correct: gotItRight };
  });

  return {
    id: crypto.randomUUID(),
    completedAt: randomPastDate(HISTORY_WEEKS).toISOString(),
    examLabel: pick(["SSC CGL", "IBPS PO", "SSC CHSL", "RRB NTPC"]),
    subjectName, topicName,
    levelLabel: pick(["Easy", "Medium", "Hard"]),
    correctCount, totalCount: chosen.length,
    results,
  };
}

function buildMockAttempt(entry, questionPools) {
  const { examCode, examLabel, paper } = entry;
  const results = [];
  let orderIndex = 0, correctCount = 0, wrongCount = 0, unattemptedCount = 0;
  let totalMarksScored = 0;

  for (const section of paper.sections) {
    const candidates = shuffle(section.subjects.flatMap((s) => questionPools[s.name] ?? []));
    const chosen = candidates.slice(0, section.questionCount);
    const marksCorrect = section.effectiveMarksCorrect ?? 1;
    const marksWrong = section.effectiveMarksWrong ?? 0;

    for (const q of chosen) {
      const correctIndex = "ABCD".indexOf(q.correctAnswer);
      const roll = Math.random();
      let selectedIndex;
      if (roll < 0.62) { selectedIndex = correctIndex; correctCount++; totalMarksScored += marksCorrect; }
      else if (roll < 0.88) { selectedIndex = (correctIndex + 1 + rand(0, 2)) % 4; wrongCount++; totalMarksScored -= marksWrong; }
      else { selectedIndex = null; unattemptedCount++; }
      results.push({
        orderIndex: orderIndex++, subjectName: q.subjectName, questionId: q.id,
        selectedIndex, correctIndex, markedForReview: Math.random() < 0.05,
      });
    }
  }

  const totalQuestions = results.length;
  if (totalQuestions === 0) return null;
  const durationSeconds = (paper.durationMinutes ?? 60) * 60;
  const timeTakenSeconds = Math.round(durationSeconds * (0.7 + Math.random() * 0.3));
  const startedAt = randomPastDate(HISTORY_WEEKS);
  const completedAt = new Date(startedAt.getTime() + timeTakenSeconds * 1000);

  return {
    id: crypto.randomUUID(),
    examCode, examLabel: `${examLabel} — ${paper.name}`,
    startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(),
    durationSeconds, timeTakenSeconds,
    marksCorrect: paper.marksCorrect ?? 1, marksWrong: paper.marksWrong ?? 0,
    totalMarksScored: Math.round(totalMarksScored * 100) / 100,
    correctCount, wrongCount, unattemptedCount, totalQuestions,
    results,
  };
}

async function main() {
  const token = await signUpOrLogInDemo();

  console.log("Fetching mockable papers and question pools...");
  const [papers, questionPools] = await Promise.all([getMockablePapers(), buildQuestionPoolsBySubject()]);
  console.log(`  ${papers.length} mockable papers found across active exams`);

  const subjectNames = Object.keys(questionPools).filter((s) => questionPools[s].length > 0);

  const practiceSessions = [];
  for (let i = 0; i < PRACTICE_SESSION_COUNT; i++) {
    const subjectName = pick(subjectNames);
    const session = buildPracticeSession(subjectName, questionPools[subjectName]);
    if (session) practiceSessions.push(session);
  }

  const mockAttempts = [];
  for (let i = 0; i < MOCK_ATTEMPT_COUNT; i++) {
    const attempt = buildMockAttempt(pick(papers), questionPools);
    if (attempt) mockAttempts.push(attempt);
  }

  console.log(`Uploading ${practiceSessions.length} practice sessions and ${mockAttempts.length} mock attempts...`);
  const result = await post("/api/progress/sync", { practiceSessions, mockAttempts }, token);
  console.log("Upload result:", result);

  const restored = await get("/api/progress", token);
  console.log(`Verified via restore: ${restored.practiceSessions.length} practice sessions, ${restored.mockAttempts.length} mock attempts.`);
  console.log(`\nDemo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
