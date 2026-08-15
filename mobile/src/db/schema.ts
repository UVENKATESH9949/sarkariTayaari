import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const languages = sqliteTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Mirrors the backend's Exam entity — synced from GET /api/exams (active-only).
export const exams = sqliteTable("exams", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  displayOrder: integer("display_order").notNull().default(0),
});

// Mirrors Subject — synced from GET /api/subjects. Global, not per-exam.
// icon/color/colorBg come from the server so a subject added by an admin renders
// correctly without an app release — there is no client-side lookup by name.
export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  icon: text("icon"),
  color: text("color"),
  colorBg: text("color_bg"),
});

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
    uniqueIndex("idx_question_translations_question_language").on(table.questionId, table.languageCode),
    index("idx_question_translations_question_id").on(table.questionId),
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
    subjectName: text("subject_name").notNull(),
    topicName: text("topic_name").notNull(),
    levelLabel: text("level_label").notNull(),
    correctCount: integer("correct_count").notNull(),
    totalCount: integer("total_count").notNull(),
  },
  (table) => [index("idx_practice_sessions_completed_at").on(table.completedAt)],
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
  },
  (table) => [index("idx_mock_test_attempts_completed_at").on(table.completedAt)],
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

// Local-only bookmarked questions (Revise tab). Stores a full content
// snapshot rather than just a question_id, same rationale as before: nothing
// elsewhere guarantees the synced question row still exists/matches later.
export const bookmarks = sqliteTable("bookmarks", {
  questionId: text("question_id").primaryKey(),
  questionText: text("question_text").notNull(),
  options: text("options", { mode: "json" }).notNull().$type<string[]>(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull(),
  subjectName: text("subject_name").notNull(),
  topicName: text("topic_name").notNull(),
  examLabel: text("exam_label").notNull(),
  bookmarkedAt: integer("bookmarked_at", { mode: "timestamp_ms" }).notNull(),
});
