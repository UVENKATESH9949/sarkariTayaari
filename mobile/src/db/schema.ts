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
    // Epic L / TICKET-2102. Null = top level. Deliberately NOT a `.references(() => topics.id)`
    // self-FK: drizzle cannot express a self-reference in the same table definition without a
    // circular initialisation, and more importantly the server already guarantees the invariant
    // (TopicService rejects cycles and cross-subject parents). A local read cache is the wrong
    // place to re-litigate a server-side invariant — the same reasoning as `subjects.name` not
    // being UNIQUE here even though Postgres declares it so.
    parentId: text("parent_id"),
    // Denormalized, like subjectName above, so a topic list can show "Arithmetic → Percentage"
    // without a self-join on every row.
    parentName: text("parent_name"),
  },
  (table) => [
    index("idx_topics_subject_id").on(table.subjectId),
    index("idx_topics_parent_id").on(table.parentId),
  ],
);

/**
 * Epic L / TICKET-2103 — which topics should be studied before a given one.
 *
 * A directed graph, not a tree. Synced as a full replace per topic, because the server sends
 * the complete prerequisite list on every topic row and there is no delta concept for it.
 */
export const topicPrerequisites = sqliteTable(
  "topic_prerequisites",
  {
    topicId: text("topic_id").notNull().references(() => topics.id),
    prerequisiteTopicId: text("prerequisite_topic_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.topicId, table.prerequisiteTopicId] }),
    index("idx_topic_prerequisites_prerequisite").on(table.prerequisiteTopicId),
  ],
);

/**
 * Epic L / TICKET-2101 + 2106 + 2107 — per-exam topic relevance and its computed priority,
 * synced from GET /api/exams/{code}/topic-intelligence.
 *
 * One flat table rather than mirroring the server's three (`exam_topics`, `topic_trend`,
 * `topic_priority`). The server already joins them into one row per topic and the app only ever
 * reads them together, so keeping three tables here would mean re-doing that join on a device
 * for no benefit. The server stays the place where the three concerns are kept separable.
 *
 * `curatedWeightagePercent` and `computedWeightagePercent` are both carried, and both are shown
 * — the whole point of §66 is that a human's figure and a derived one stay distinguishable, and
 * collapsing them here would undo that at the last step.
 */
export const examTopicIntelligence = sqliteTable(
  "exam_topic_intelligence",
  {
    examCode: text("exam_code").notNull().references(() => exams.code),
    topicId: text("topic_id").notNull().references(() => topics.id),
    curatedWeightagePercent: real("curated_weightage_percent"),
    computedWeightagePercent: real("computed_weightage_percent"),
    appearanceCount: integer("appearance_count").notNull().default(0),
    windowFromYear: integer("window_from_year"),
    windowToYear: integer("window_to_year"),
    // RISING | STABLE | FALLING | INSUFFICIENT_DATA. Stored as text, not a union-typed enum,
    // for the same reason difficulty_levels is a table: the app renders what it receives.
    trendDirection: text("trend_direction"),
    trendScore: real("trend_score"),
    // Kept separate on the device too, so the UI can show that a human overrode the formula
    // rather than silently presenting the override as if it were computed.
    systemPriority: real("system_priority"),
    adminOverride: real("admin_override"),
    finalPriority: real("final_priority"),
    algorithmVersion: text("algorithm_version"),
  },
  (table) => [
    primaryKey({ columns: [table.examCode, table.topicId] }),
    // The Topics screen orders by final priority within one exam.
    index("idx_exam_topic_intelligence_priority").on(table.examCode, table.finalPriority),
    index("idx_exam_topic_intelligence_topic").on(table.topicId),
  ],
);

/**
 * Epic L / TICKET-2105 — this device's per-topic mastery.
 *
 * Mutable state, so it follows the `bookmarks` pattern rather than the append-only
 * practice_sessions one: `isSynced` queues local changes, and `updatedAt` is what the server
 * resolves conflicting devices by (last-write-wins).
 *
 * No tombstone column, unlike bookmarks. Progress is never deleted — a topic only moves between
 * states — so there is nothing for a tombstone to represent.
 */
export const topicProgress = sqliteTable(
  "topic_progress",
  {
    topicId: text("topic_id").primaryKey(),
    // NOT_STARTED | LEARNING | PRACTICING | MASTERED | NEEDS_REVISION
    state: text("state").notNull().default("NOT_STARTED"),
    accuracyPercent: real("accuracy_percent"),
    attemptedCount: integer("attempted_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    totalTimeMs: integer("total_time_ms").notNull().default(0),
    lastPracticedAt: integer("last_practiced_at", { mode: "timestamp_ms" }),
    isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_topic_progress_is_synced").on(table.isSynced),
    // Serves the weak-areas read, which orders by accuracy ascending.
    index("idx_topic_progress_accuracy").on(table.accuracyPercent),
  ],
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

// ---------------------------------------------------------------------- Exam Guide (§44 offline cache)
//
// Mirrors the backend's combined ExamGuideResponse (GET /api/exam-guides), synced during
// the ordinary reference-data pass alongside exam structures and topic intelligence — see
// writeExamGuides() in sync/writeQuestions.ts. Only ever holds each exam's CURRENT,
// published cycle (never history), so every child table is keyed by examCode rather than
// the backend's recruitmentCycleId: there is exactly one synced cycle per exam locally,
// which is what makes a wholesale delete+reinsert on every sync safe and simple, the same
// pattern writeExamStructures already uses. recruitmentCycleId is still stored on the
// parent row — screens need it for the live §30 "what's changed" and document-status calls.
export const examGuideCycles = sqliteTable("exam_guide_cycles", {
  examCode: text("exam_code").primaryKey().references(() => exams.code),
  recruitmentCycleId: text("recruitment_cycle_id").notNull(),
  examName: text("exam_name").notNull(),
  cycleName: text("cycle_name").notNull(),
  status: text("status").notNull(),
  notificationDate: text("notification_date"),
  applicationStart: text("application_start"),
  applicationEnd: text("application_end"),
  examStart: text("exam_start"),
  examEnd: text("exam_end"),
  vacancyCount: integer("vacancy_count"),
  notificationUrl: text("notification_url"),
  overviewText: text("overview_text"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  lastVerifiedAt: text("last_verified_at"),
});

// 1:1 with examGuideCycles — same convention as the backend's eligibility_rules (the PK
// IS the parent reference, not a separate surrogate id).
export const examGuideEligibility = sqliteTable("exam_guide_eligibility", {
  examCode: text("exam_code").primaryKey().references(() => examGuideCycles.examCode),
  minimumAge: integer("minimum_age"),
  maximumAge: integer("maximum_age"),
  ageCutoffDate: text("age_cutoff_date"),
  qualification: text("qualification"),
  nationality: text("nationality"),
  genderRequirement: text("gender_requirement"),
  // JSON-encoded {"OBC": 3, "SC": 5, ...} — same shape as the backend's JSONB column.
  categoryRelaxation: text("category_relaxation"),
  specialRequirements: text("special_requirements"),
  sourceId: text("source_id"),
});

export const examGuideDates = sqliteTable(
  "exam_guide_dates",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull().references(() => examGuideCycles.examCode),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    official: integer("official", { mode: "boolean" }).notNull().default(false),
    sourceId: text("source_id"),
    // The server already sorts these; SQLite has no reliable "insertion order" to lean on
    // instead, so the position is stored explicitly and read back with ORDER BY.
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("idx_exam_guide_dates_exam_code").on(table.examCode)],
);

export const examGuideDocuments = sqliteTable(
  "exam_guide_documents",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull().references(() => examGuideCycles.examCode),
    documentName: text("document_name").notNull(),
    required: text("required").notNull(),
    applicableFor: text("applicable_for"),
    format: text("format"),
    maxSizeKb: integer("max_size_kb"),
    dimensions: text("dimensions"),
    instructions: text("instructions"),
    // Whatever the last sync's signed-in user saw — a snapshot, not a second source of
    // truth. Writing a new status still goes straight to the server (see exam-guide.tsx);
    // this column only matters for what an offline read shows in the meantime.
    userStatus: text("user_status"),
    sourceId: text("source_id"),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("idx_exam_guide_documents_exam_code").on(table.examCode)],
);

// ApplicationStepSummary carries no id from the server (stepNumber is unique per cycle,
// which is exactly what ADR-005's synthetic-id convention is for).
export const examGuideSteps = sqliteTable(
  "exam_guide_steps",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull().references(() => examGuideCycles.examCode),
    stepNumber: integer("step_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    warning: text("warning"),
    officialUrl: text("official_url"),
  },
  (table) => [index("idx_exam_guide_steps_exam_code").on(table.examCode)],
);

// applicationMistakes is a bare List<String> server-side — synthetic id "examCode:index".
export const examGuideMistakes = sqliteTable(
  "exam_guide_mistakes",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull().references(() => examGuideCycles.examCode),
    mistake: text("mistake").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("idx_exam_guide_mistakes_exam_code").on(table.examCode)],
);

// FeeSummary carries no id — category is unique per cycle, so "examCode:category" is the
// synthetic id (ADR-005), same reasoning as examGuideSteps above.
export const examGuideFees = sqliteTable(
  "exam_guide_fees",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull().references(() => examGuideCycles.examCode),
    category: text("category").notNull(),
    amountRupees: integer("amount_rupees").notNull().default(0),
    exempted: integer("exempted", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    sourceId: text("source_id"),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("idx_exam_guide_fees_exam_code").on(table.examCode)],
);

// Global, not per-exam — the same source can be (and often is) cited by several exams'
// facts, matching the backend's shared exam_sources table. Upserted, never wiped, since a
// source not currently cited by a synced exam guide may still be cited by a cached one.
export const examGuideSources = sqliteTable("exam_guide_sources", {
  id: text("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull(),
  url: text("url"),
});

// Spec §25/§26 "Career Information". Carries a real backend id (ExamCareerPost's UUID),
// unlike the other synthetic-id child tables above — career posts are exam-scoped, not
// cycle-scoped, on the backend too (see the backend's V19 migration comment), but they're
// still synced and read alongside the rest of the guide since ExamGuideResponse bundles
// them in (one combined endpoint, per §59) — so this table is keyed the same way as its
// siblings for consistency, even though its FK is conceptually "this exam" rather than
// "this exam's current cycle".
export const examGuideCareerPosts = sqliteTable(
  "exam_guide_career_posts",
  {
    id: text("id").primaryKey(),
    examCode: text("exam_code").notNull().references(() => examGuideCycles.examCode),
    postTitle: text("post_title").notNull(),
    payLevel: text("pay_level"),
    salaryMinRupees: integer("salary_min_rupees"),
    salaryMaxRupees: integer("salary_max_rupees"),
    growthPath: text("growth_path"),
    description: text("description"),
    sourceId: text("source_id"),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("idx_exam_guide_career_posts_exam_code").on(table.examCode)],
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
    // Epic L / TICKET-2104 — previous-year provenance, shown as a badge on the question itself.
    // `isPyq` is carried separately from `pyqYear` rather than derived from it, matching the
    // server: a question can be known to be a PYQ while its exact year is still unverified.
    isPyq: integer("is_pyq", { mode: "boolean" }).notNull().default(false),
    pyqYear: integer("pyq_year"),
    pyqShift: text("pyq_shift"),
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

// Which exam(s) the user is preparing for. Feeds Home's "Preparing for <exam>" card, My
// Exams, and the Exams module's Follow star. Was local-only until the Exams module
// (spec's own real backend Follow sync decision) — is_deleted/is_synced/updated_at mirror
// `bookmarks` exactly, added in the same migration, for the same last-write-wins reason.
export const followedExams = sqliteTable(
  "followed_exams",
  {
    examCode: text("exam_code").primaryKey().references(() => exams.code),
    targetDate: integer("target_date", { mode: "timestamp_ms" }),
    followedAt: integer("followed_at", { mode: "timestamp_ms" }).notNull(),
    isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
    isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_followed_exams_is_synced").on(table.isSynced)],
);

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
    // The number of questions actually ANSWERED, which is the denominator of every
    // accuracy figure in the app. Before early finishing existed this was always equal
    // to the size of the question set, because answering all of them was mandatory; it
    // is no longer, so the two meanings had to be split (see availableCount below).
    totalCount: integer("total_count").notNull(),
    // How many questions the set offered, which may now exceed totalCount because the
    // user is allowed to stop early. Deliberately kept OUT of every accuracy
    // calculation — a student who answered 17 of 50 correctly-answered-15 has 88%
    // accuracy, not 30%. It exists only so the summary can say "17 of 50 attempted".
    //
    // Nullable, and local-only: it is not part of the server's practice-session
    // contract, so sessions from before this column (and any session that round-trips
    // through the server) legitimately have no value here and simply omit the row.
    availableCount: integer("available_count"),
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

// Exam Guide spec §21 "Diagnostic Test" — local-only, like practiceSessions above. Records
// that an attempt happened, not the scoring: per-topic mastery from a diagnostic feeds the
// SAME topicProgress table an ordinary practice session does (via recordTopicPractice), so
// results sync and show up in the Prepare checklist through the mechanism that already
// exists rather than a parallel progress model.
export const diagnosticAttempts = sqliteTable("diagnostic_attempts", {
  id: text("id").primaryKey(),
  examCode: text("exam_code").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  questionCount: integer("question_count").notNull(),
  correctCount: integer("correct_count").notNull(),
  // JSON array of {topicId, topicName, subjectName, correctCount, totalCount, state} — see
  // the migration's own comment for why this isn't re-derived from topicProgress instead.
  perTopicJson: text("per_topic_json").notNull(),
});

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

/**
 * Device-local UI preferences: theme, content zoom, interface language.
 *
 * Single row keyed "current", matching sync_meta and auth_session. Kept in SQLite
 * rather than adding AsyncStorage because SQLite is already a hard dependency that
 * the app cannot start without — a second storage engine for three scalars would be
 * a native module added for no gain.
 *
 * Deliberately NOT synced to the server and deliberately NOT cleared on sign-out.
 * These describe the device (this phone's screen, the language its owner reads),
 * not the account: a shared phone signing in to a second account should not have
 * its text size change, and signing out should not throw away an accessibility
 * setting someone needs in order to use the app at all.
 *
 * Every column is nullable so an absent value means "never chosen" and can fall
 * back to the app default, which is distinct from having explicitly chosen the
 * value that happens to equal the default.
 */
export const appPreferences = sqliteTable("app_preferences", {
  key: text("key").primaryKey(),
  /** "dark" | "light". Validated on read — see db/preferences.ts. */
  themeMode: text("theme_mode"),
  /** Content scale multiplier, e.g. 1.0 = 100%. Clamped on read. */
  zoomLevel: real("zoom_level"),
  /** Interface language code ("en" | "te"), NOT the quiz-content language. */
  uiLanguage: text("ui_language"),
});
