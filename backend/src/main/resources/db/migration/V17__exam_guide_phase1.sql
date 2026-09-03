-- Exam Guide / Exam Intelligence, Phase 1 (see preparation-os-requirements.md's new
-- "SARKARITAAYARI - EXAM GUIDE" spec, referred to below as "the spec").
--
-- Selection process, exam pattern and syllabus already exist (exam_stages/exam_papers/
-- paper_sections from V3, exam_subjects/topics from V4/V12) and are NOT duplicated here.
-- What's new is the recruitment-cycle-scoped content the spec's §33 "Information
-- Versioning" principle requires: an exam's eligibility, dates, fees and documents are
-- not fixed facts about the exam, they change every year, and showing 2026's fee for a
-- 2027 application is exactly the failure mode §61 warns about.
--
-- Everything cycle-scoped below cascades from recruitment_cycles: deleting a cycle is a
-- real "we entered this wrong, start over" action, and half-deleted dates/fees/documents
-- left behind would be worse than a clean cascade. Exams themselves still do NOT cascade
-- (unchanged from V3) — deleting an exam that has cycles should fail loudly.

CREATE TABLE recruitment_cycles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_code           VARCHAR(30) NOT NULL REFERENCES exams (code),
    -- A label, not a year int — "2027" today, but some exams run cycles named things
    -- like "2027 (Combined)". Uniqueness is per exam, not global.
    cycle_name          VARCHAR(100) NOT NULL,
    -- One of the spec's §6 lifecycle values. A plain VARCHAR with an application-level
    -- enum (RecruitmentCycleStatus), not a DB enum/CHECK — matches TopicTrend.Direction
    -- and every other lifecycle field in this codebase, and keeps adding a new status a
    -- one-line Java change instead of a migration.
    status              VARCHAR(30) NOT NULL DEFAULT 'NOT_ANNOUNCED',
    notification_date   DATE,
    application_start    DATE,
    application_end      DATE,
    exam_start          DATE,
    exam_end            DATE,
    vacancy_count       INT,
    notification_url    TEXT,
    -- §62 "current" cycle logic: admin-set rather than derived from dates/status. A
    -- date-derived rule sounds more automatic but is strictly worse here — an admin who
    -- has just entered next year's cycle needs the OLD one to keep serving the app until
    -- they're ready to flip the switch, not the instant a date field makes the new one
    -- "look current". The partial unique index below is what makes this safe: at most
    -- one current cycle per exam, enforced by Postgres, not by admin discipline.
    is_current          BOOLEAN NOT NULL DEFAULT false,
    -- Demo/synthetic content must be structurally distinguishable from a real notification
    -- forever, not just at seed time — this is the mechanism behind the "seed visible demo
    -- content, labelled as demo in the UI itself" decision. Admin content management
    -- (V18+) will let real content replace this per exam; until then every consumer
    -- (mobile + admin) must render a demo badge whenever this is true.
    is_demo             BOOLEAN NOT NULL DEFAULT false,
    last_verified_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (exam_code, cycle_name)
);

CREATE INDEX idx_recruitment_cycles_exam_code ON recruitment_cycles (exam_code);
-- Enforces "at most one current cycle per exam" — see the is_current comment above.
CREATE UNIQUE INDEX uq_recruitment_cycles_current ON recruitment_cycles (exam_code) WHERE is_current;

-- §32 "Official Source System". One shared table rather than a source_name/source_url
-- pair duplicated on every content row (dates, fees, documents, eligibility all cite
-- one): a source is reused across many facts from the same notification, and a typo'd
-- URL should be one row to fix, not a dozen.
CREATE TABLE exam_sources (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name       VARCHAR(150) NOT NULL,
    -- OFFICIAL_NOTIFICATION | OFFICIAL_WEBSITE | OFFICIAL_CALENDAR | OFFICIAL_NOTICE |
    -- ADMIN_ESTIMATE (the last one is how a demo/editorial figure without a real
    -- notification behind it stays honestly labelled, per §18's estimate/actual split).
    source_type       VARCHAR(30) NOT NULL,
    url               TEXT,
    publication_date  DATE,
    last_verified_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §9/§34 EligibilityRule. One row per cycle (the PK IS the FK) rather than a UUID id:
-- eligibility is not a list of things, it is one fact about one cycle, and a 1:1 table
-- with its own surrogate key would just be an extra join for no benefit.
CREATE TABLE eligibility_rules (
    recruitment_cycle_id  UUID PRIMARY KEY REFERENCES recruitment_cycles (id) ON DELETE CASCADE,
    minimum_age           INT,
    maximum_age           INT,
    -- The date age is computed AS OF — "as on 01-08-2027" — not today. Without this
    -- field stored explicitly, the eligibility checker (Phase 3) would have nothing
    -- authoritative to compute age against once the current date has moved past it.
    age_cutoff_date       DATE,
    qualification         TEXT,
    nationality            TEXT,
    gender_requirement     TEXT,
    -- {"OBC": 3, "SC": 5, "ST": 5, "PWBD": 10} — years of age relaxation per category.
    -- JSONB because the category vocabulary is genuinely open-ended across exams (state
    -- exams add categories SSC doesn't have) and relaxation is the only place per-exam
    -- category rules actually need arbitrary shape; a fixed column per category would
    -- have to keep growing.
    category_relaxation    JSONB,
    special_requirements   TEXT,
    source_id              UUID REFERENCES exam_sources (id) ON DELETE SET NULL
);

-- §7/§34 ImportantDate. Many per cycle, ordered into the spec's timeline.
CREATE TABLE important_dates (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruitment_cycle_id   UUID NOT NULL REFERENCES recruitment_cycles (id) ON DELETE CASCADE,
    -- NOTIFICATION | APPLICATION_START | APPLICATION_END | CORRECTION_WINDOW |
    -- ADMIT_CARD | EXAM_STAGE | ANSWER_KEY | RESULT | FINAL_RESULT
    event_type             VARCHAR(40) NOT NULL,
    title                  VARCHAR(150) NOT NULL,
    start_date             DATE,
    end_date               DATE,
    -- §7: "Expected" vs "Official" is not decoration, it's the field the UI branches on.
    is_official            BOOLEAN NOT NULL DEFAULT false,
    display_order          INT NOT NULL DEFAULT 0,
    source_id              UUID REFERENCES exam_sources (id) ON DELETE SET NULL
);

CREATE INDEX idx_important_dates_cycle ON important_dates (recruitment_cycle_id, display_order);

-- §11/§34 DocumentRequirement — the admin-authored catalogue for one cycle.
CREATE TABLE document_requirements (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruitment_cycle_id   UUID NOT NULL REFERENCES recruitment_cycles (id) ON DELETE CASCADE,
    document_name          VARCHAR(150) NOT NULL,
    -- YES | NO | IF_APPLICABLE — a plain boolean can't express "if applicable" (§11's
    -- own example row, "Category Certificate | If applicable"), so this needed three
    -- states from the start rather than a bool plus a nullable exception column.
    required               VARCHAR(20) NOT NULL DEFAULT 'YES',
    applicable_for         VARCHAR(150),
    format                 VARCHAR(100),
    max_size_kb            INT,
    dimensions             VARCHAR(100),
    instructions           TEXT,
    display_order          INT NOT NULL DEFAULT 0,
    source_id              UUID REFERENCES exam_sources (id) ON DELETE SET NULL
);

CREATE INDEX idx_document_requirements_cycle ON document_requirements (recruitment_cycle_id, display_order);

-- §11 per-user Ready/Missing/Not-Applicable tracking, and the same mechanism doubles as
-- the "Before You Apply" checklist's document-readiness half (see the admin/mobile
-- report for the documented scope call on why a separate checklist table wasn't added).
--
-- Synthetic VARCHAR id ("{userId}:{documentRequirementId}"), not a JPA @IdClass composite
-- key — per ADR-005 (reports/architecture-decisions.md), a composite @IdClass caused real
-- 500s on user_bookmarks (isNew() entity-state detection misbehaving for a derived
-- identifier). Same convention as user_bookmarks (V7) and user_topic_progress (V14).
CREATE TABLE user_document_status (
    id                       VARCHAR(80) PRIMARY KEY,
    user_id                  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    document_requirement_id  UUID NOT NULL REFERENCES document_requirements (id) ON DELETE CASCADE,
    -- READY | MISSING | NOT_APPLICABLE
    status                   VARCHAR(20) NOT NULL DEFAULT 'MISSING',
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_document_status_user ON user_document_status (user_id);

-- §12/§34 ApplicationStep — the step-by-step guide, ordered.
CREATE TABLE application_steps (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruitment_cycle_id   UUID NOT NULL REFERENCES recruitment_cycles (id) ON DELETE CASCADE,
    step_number            INT NOT NULL,
    title                  VARCHAR(150) NOT NULL,
    description            TEXT,
    warning                TEXT,
    official_url           TEXT,
    UNIQUE (recruitment_cycle_id, step_number)
);

-- §13 Common Application Mistakes. A separate list, not per-step: the spec's own
-- examples ("Incorrect date of birth", "Payment failure") aren't tied to any one step —
-- several span the whole application — so folding them into application_steps would
-- force a fake step_number on each one.
CREATE TABLE application_mistakes (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruitment_cycle_id   UUID NOT NULL REFERENCES recruitment_cycles (id) ON DELETE CASCADE,
    mistake                TEXT NOT NULL,
    display_order          INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_application_mistakes_cycle ON application_mistakes (recruitment_cycle_id, display_order);

-- §14/§34 FeeRule.
CREATE TABLE fee_rules (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruitment_cycle_id   UUID NOT NULL REFERENCES recruitment_cycles (id) ON DELETE CASCADE,
    -- GENERAL | OBC | SC | ST | FEMALE | PWBD | EX_SERVICEMEN — open vocabulary on
    -- purpose, matching category_relaxation above; different exams recognise different
    -- category sets.
    category               VARCHAR(50) NOT NULL,
    -- Whole rupees as an integer. Every real fee in this domain (SSC, banking, railways)
    -- is a round rupee amount; a NUMERIC/DECIMAL column would just invite showing paise
    -- that no notification ever specifies.
    amount_rupees          INT NOT NULL DEFAULT 0,
    is_exempted            BOOLEAN NOT NULL DEFAULT false,
    notes                  TEXT,
    display_order          INT NOT NULL DEFAULT 0,
    source_id              UUID REFERENCES exam_sources (id) ON DELETE SET NULL,
    UNIQUE (recruitment_cycle_id, category)
);
