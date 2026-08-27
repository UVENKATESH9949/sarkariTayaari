import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const languages = sqliteTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Mirrors the backend's Exam entity — synced from GET /api/exams (active-only).
// difficulty/badge are codes into difficulty_levels and exam_badges below, not display
// strings — the label and colours are looked up from those tables at render time, so an
// admin recolouring a badge needs no app release. Both are nullable: most exams have
// neither, and absent must render as absent rather than defaulting to a wrong value.
export const exams = sqliteTable("exams", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  displayOrder: integer("display_order").notNull().default(0),
  difficulty: text("difficulty"),
  badge: text("badge"),
});

// Synced from GET /api/exam-badges (active-only). The editorial tag vocabulary
// ("Trending"/"Popular") — a table rather than a union for the same reason
// difficulty_levels is one.
export const examBadges = sqliteTable("exam_badges", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  color: text("color"),
  colorBg: text("color_bg"),
});

// Mirrors Subject — synced from GET /api/subjects. Global, not per-exam.
// icon/color/colorBg come from the server so a subject added by an admin renders
// correctly without an app release — there is no client-side lookup by name.
export const subjects = sqliteTable(
  "subjects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    icon: text("icon"),
    color: text("color"),
    colorBg: text("color_bg"),
  },
  // Serves getSubjectMetaByName(), which looks subjects up by name from three screens and
  // previously had no index at all.
  //
  // Deliberately NOT unique, even though Postgres declares `subjects.name UNIQUE`.
  // Mirroring that here would add nothing to query performance and would make this
  // migration capable of failing on a device that already holds a duplicate — and a
  // failed migration is a hard gate in app/_layout.tsx, i.e. an app that cannot start.
  // A local read cache is the wrong place to re-litigate a server-side invariant.
  (table) => [index("idx_subjects_name").on(table.name)],
);

// Synced from GET /api/difficulty-levels (active-only). Replaces the hardcoded
// "easy" | "medium" | "hard" union — the app renders whatever it receives.
export const difficultyLevels = sqliteTable("difficulty_levels", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  color: text("color"),
  colorBg: text("color_bg"),
  icon: text("icon"),
});

// Synced from GET /api/paper-types. `mockable` decides whether a mock test can be
// generated from a paper at all (UPSC Mains is descriptive, for example).
export const paperTypes = sqliteTable("paper_types", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  mockable: integer("mockable", { mode: "boolean" }).notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
});

// Mirrors Topic — synced from GET /api/topics. subjectName is denormalized
// (also present on the server response) so topic list screens don't need a join.
export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull().references(() => subjects.id),
    subjectName: text("subject_name").notNull(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("idx_topics_subject_id").on(table.subjectId)],
);

/* ------------------------------------------------------------ Exam structure */
// Exam → Stage → Paper → Section → Subjects, synced from GET /api/exam-structures.
// Replaces the hardcoded per-exam blueprint that used to live in mockTest/blueprints.ts.

/**
 * The exam's syllabus — which subjects it covers. Separate from the section mapping
 * below: a subject belongs to many exams, and an exam can cover a subject before any
 * paper pattern exists for it. This is what Practice browsing is scoped by.
 */
export const examSubjects = sqliteTable(
  "exam_subjects",
  {
    examCode: text("exam_code").notNull().references(() => exams.code),
    subjectId: text("subject_id").notNull().references(() => subjects.id),
  },
  (table) => [
    primaryKey({ columns: [table.examCode, table.subjectId] }),
    index("idx_exam_subjects_subject_id").on(table.subjectId),
  ],
);

export const examStages = sqliteTable(
  "exam_stages",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull().references(() => exams.code),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    effectiveFrom: text("effective_from"),
    versionLabel: text("version_label"),
  },
  (table) => [index("idx_exam_stages_exam_code").on(table.examCode)],
);

export const examPapers = sqliteTable(
  "exam_papers",
  {
    id: text("id").primaryKey(),
    stageId: text("stage_id").notNull().references(() => examStages.id),
    // Denormalized so "papers for this exam" needs no join.
    examCode: text("exam_code").notNull(),
    name: text("name").notNull(),
    paperType: text("paper_type").notNull(),
    isMockable: integer("is_mockable", { mode: "boolean" }).notNull().default(false),
    durationMinutes: integer("duration_minutes"),
    totalMarks: real("total_marks"),
    marksCorrect: real("marks_correct"),
    marksWrong: real("marks_wrong"),
    isQualifying: integer("is_qualifying", { mode: "boolean" }).notNull().default(false),
    qualifyingPercentage: real("qualifying_percentage"),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [
    index("idx_exam_papers_stage_id").on(table.stageId),
    index("idx_exam_papers_exam_code").on(table.examCode),
  ],
);

export const paperSections = sqliteTable(
  "paper_sections",
  {
    id: text("id").primaryKey(),
    paperId: text("paper_id").notNull().references(() => examPapers.id),
    name: text("name").notNull(),
    questionCount: integer("question_count").notNull().default(0),
    // null = shares the paper's overall time; set = its own enforced timer.
    durationMinutes: integer("duration_minutes"),
    isSectionallyTimed: integer("is_sectionally_timed", { mode: "boolean" }).notNull().default(false),
    // Stored already resolved: the server sends effective values with the paper's
    // marking substituted in where the section doesn't override it, so scoring here
    // never has to reimplement that fallback.
    marksCorrect: real("marks_correct"),
    marksWrong: real("marks_wrong"),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("idx_paper_sections_paper_id").on(table.paperId)],
);

export const sectionSubjects = sqliteTable(
  "section_subjects",
  {
    sectionId: text("section_id").notNull().references(() => paperSections.id),
    subjectId: text("subject_id").notNull().references(() => subjects.id),
  },
  (table) => [
    primaryKey({ columns: [table.sectionId, table.subjectId] }),
    index("idx_section_subjects_subject_id").on(table.subjectId),
  ],
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    correctAnswer: text("correct_answer").notNull(),
    subjectId: text("subject_id").notNull().references(() => subjects.id),
    subjectName: text("subject_name").notNull(),
    topicId: text("topic_id").notNull().references(() => topics.id),
    topicName: text("topic_name").notNull(),
    difficulty: text("difficulty").notNull(),
    isPremium: integer("is_premium", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("idx_questions_subject_id").on(table.subjectId),
    index("idx_questions_topic_id").on(table.topicId),
    index("idx_questions_difficulty").on(table.difficulty),
    index("idx_questions_updated_at").on(table.updatedAt),
    // Composites matching what the practice queries actually filter on. Every questions
    // query in the app also filters `is_deleted = false`, which the single-column indexes
    // above leave to a scan: SQLite picks one of them and then walks the rest. Trailing
    // `is_deleted` is deliberate — it's the lowest-cardinality column, so it belongs last.
    index("idx_questions_topic_difficulty_deleted").on(table.topicId, table.difficulty, table.isDeleted),
    index("idx_questions_subject_deleted").on(table.subjectId, table.isDeleted),
  ],
);

// Replaces the old flat questions.exam_type column — a question can now be
// tagged to multiple exams. Rewritten (delete + reinsert) on every upsert
// rather than diffed, since the server always sends the full exam_codes list.
export const questionExams = sqliteTable(
  "question_exams",
  {
    questionId: text("question_id").notNull().references(() => questions.id),
    examCode: text("exam_code").notNull().references(() => exams.code),
  },
  (table) => [
    primaryKey({ columns: [table.questionId, table.examCode] }),
    index("idx_question_exams_exam_code").on(table.examCode),
  ],
);

export const questionTranslations = sqliteTable(
  "question_translations",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id").notNull().references(() => questions.id),
    languageCode: text("language_code").notNull().references(() => languages.code),
    questionText: text("question_text").notNull(),
    options: text("options", { mode: "json" }).notNull().$type<string[]>(),
    explanation: text("explanation"),
  },
  (table) => [
    // A separate index on `question_id` alone used to sit here too. It was a strict
    // prefix of this composite, so SQLite could never need it, and it cost write
    // amplification on the hottest write path in the app — the per-page bulk translation
    // insert during sync.
    uniqueIndex("idx_question_translations_question_language").on(table.questionId, table.languageCode),
  ],
);

// Local-only, single global row (no server equivalent) — sync is no longer
// scoped by exam, so there's exactly one "last synced at" timestamp for the
// whole question bank. `key` is always the literal "global"; it exists only
// so onConflictDoUpdate has a stable target.
export const syncMeta = sqliteTable("sync_meta", {
  key: text("key").primaryKey(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
  // Set while an initial sync is part-way through, so a sync interrupted by a network
  // drop or the app being closed resumes from the next unwritten page instead of
  // re-downloading the whole bank. Cleared on completion.
  resumePage: integer("resume_page"),
  resumeStartedAt: integer("resume_started_at", { mode: "timestamp_ms" }),
});

/**
 * The signed-in session. Single row, keyed "current".
 *
 * Kept in app-private SQLite rather than expo-secure-store to avoid adding a native
 * module mid-stream. Android app storage is already sandboxed from other apps, which is
 * adequate for a token that only grants access to a student's own practice history —
 * but SecureStore is the right upgrade before anything more sensitive lives here.
 */
export const authSession = sqliteTable("auth_session", {
  key: text("key").primaryKey(),
  token: text("token").notNull(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});

// Local-only — which exam(s) the user is preparing for. Feeds Home's
// "Preparing for <exam>" card and a future countdown-to-exam-date feature.
export const followedExams = sqliteTable("followed_exams", {
  examCode: text("exam_code").primaryKey().references(() => exams.code),
  targetDate: integer("target_date", { mode: "timestamp_ms" }),
  followedAt: integer("followed_at", { mode: "timestamp_ms" }).notNull(),
});

// Local-only — a completed Practice session (Phase 4's session-history
// feature). No server equivalent: practice is generated from locally-synced
// questions and never round-trips through the backend.
export const practiceSessions = sqliteTable(
  "practice_sessions",
  {
    id: text("id").primaryKey(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
    examLabel: text("exam_label").notNull(),
    // Nullable, same reasoning as durationMs below: sessions recorded before this column
    // existed (and the "All Government Exams" shortcut, which spans every exam at once)
    // have no single exam to attribute to — the per-exam progress card on the exam list
    // simply doesn't count them, rather than guessing from the examLabel text.
    examCode: text("exam_code"),
    subjectName: text("subject_name").notNull(),
    topicName: text("topic_name").notNull(),
    levelLabel: text("level_label").notNull(),
    correctCount: integer("correct_count").notNull(),
    totalCount: integer("total_count").notNull(),
    // Nullable: sessions recorded before this column existed have no duration on record —
    // the review screen hides the "time taken" row rather than showing a fake 0.
    durationMs: integer("duration_ms"),
    // false until this session has been accepted by the server. Written locally first
    // and uploaded afterwards, so finishing a session never waits on the network.
    isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("idx_practice_sessions_completed_at").on(table.completedAt),
    index("idx_practice_sessions_is_synced").on(table.isSynced),
  ],
);

// One row per question answered in a session — the per-question detail shown
// in Session Summary and Revise's "Wrong Answers" list.
export const practiceSessionResults = sqliteTable(
  "practice_session_results",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => practiceSessions.id),
    orderIndex: integer("order_index").notNull(),
    questionId: text("question_id").notNull(),
    questionText: text("question_text").notNull(),
    options: text("options", { mode: "json" }).notNull().$type<string[]>(),
    selectedIndex: integer("selected_index").notNull(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation").notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
  },
  (table) => [index("idx_practice_session_results_session_id").on(table.sessionId)],
);

// Local-only — a completed Mock Test attempt. Kept separate from
// practice_sessions rather than unified: a mock test has fields (duration,
// time taken, fractional marks with negative marking, marked-for-review)
// that don't apply to Practice, and forcing one schema to cover both would
// mean a pile of nullable mock-test-only columns on every Practice row.
export const mockTestAttempts = sqliteTable(
  "mock_test_attempts",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull(),
    examLabel: text("exam_label").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    timeTakenSeconds: integer("time_taken_seconds").notNull(),
    marksCorrect: real("marks_correct").notNull(),
    marksWrong: real("marks_wrong").notNull(),
    totalMarksScored: real("total_marks_scored").notNull(),
    correctCount: integer("correct_count").notNull(),
    wrongCount: integer("wrong_count").notNull(),
    unattemptedCount: integer("unattempted_count").notNull(),
    totalQuestions: integer("total_questions").notNull(),
    isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    // getMockAttemptSummary() filters on exam_code and is called once per exam on the
    // Mock Test tab mount — without this that's a full table scan per card.
    index("idx_mock_test_attempts_exam_code").on(table.examCode),
    index("idx_mock_test_attempts_completed_at").on(table.completedAt),
    index("idx_mock_test_attempts_is_synced").on(table.isSynced),
  ],
);

// One row per question in a mock test attempt — selectedIndex is nullable
// (unattempted questions have no answer, unlike Practice where every
// recorded result was actually answered before moving on).
export const mockTestAttemptResults = sqliteTable(
  "mock_test_attempt_results",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull().references(() => mockTestAttempts.id),
    orderIndex: integer("order_index").notNull(),
    subjectName: text("subject_name").notNull(),
    questionId: text("question_id").notNull(),
    questionText: text("question_text").notNull(),
    options: text("options", { mode: "json" }).notNull().$type<string[]>(),
    selectedIndex: integer("selected_index"),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation").notNull(),
    markedForReview: integer("marked_for_review", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [index("idx_mock_test_attempt_results_attempt_id").on(table.attemptId)],
);

// Bookmarked questions (Revise tab). Stores a full content snapshot rather than just a
// question_id, same rationale as before: nothing elsewhere guarantees the synced
// question row still exists/matches later.
//
// isDeleted is a tombstone, not a hard delete: un-bookmarking while offline still needs
// to reach the server on the next sync, and a hard-deleted row leaves nothing to upload.
// isSynced/updatedAt mirror the practice/mock sync columns — same pending-queue and
// last-write-wins pattern, because unlike those append-only tables a bookmark is mutable
// state that can be toggled from more than one device.
export const bookmarks = sqliteTable(
  "bookmarks",
  {
    questionId: text("question_id").primaryKey(),
    questionText: text("question_text").notNull(),
    options: text("options", { mode: "json" }).notNull().$type<string[]>(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation").notNull(),
    subjectName: text("subject_name").notNull(),
    topicName: text("topic_name").notNull(),
    examLabel: text("exam_label").notNull(),
    bookmarkedAt: integer("bookmarked_at", { mode: "timestamp_ms" }).notNull(),
    isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
    isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  // Covers all three predicates this table is queried by: `is_deleted` alone
  // (loadBookmarks, which runs at app startup), `is_synced` alone (loadPendingBookmarks —
  // served by this index's leading column via a skip-scan only if is_deleted is also
  // constrained, so it keeps its own), and both together (pruneSyncedTombstones).
  (table) => [
    index("idx_bookmarks_is_deleted_is_synced").on(table.isDeleted, table.isSynced),
    index("idx_bookmarks_is_synced").on(table.isSynced),
  ],
);
