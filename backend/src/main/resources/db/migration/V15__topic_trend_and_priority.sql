-- Epic L / TICKET-2106 (derived trend + weightage, algorithm-versioned) and TICKET-2107
-- (admin priority override). See preparation-os-requirements.md §18.3.
--
-- Two tables rather than extra columns on `exam_topics`, for a reason the supplied spec's
-- §66/§67 is explicit about: a *computed* value and a *human* value must stay
-- distinguishable, and a stored recommendation must stay explainable after the formula
-- that produced it changes. `exam_topics.weightage_percent` (V12) is the admin's curated
-- figure and is deliberately left untouched by everything here.

-- ------------------------------------------------------------------ Trend
-- One row per (exam, topic) per algorithm version. Derived entirely from PYQ-tagged
-- questions (V13), so before any question carries a year this table is legitimately empty
-- — which is different from every topic having a trend of zero, and the API reports it as
-- such rather than inventing a value.
CREATE TABLE topic_trend (
    id                  VARCHAR(80) PRIMARY KEY,
    exam_code           VARCHAR(30) NOT NULL REFERENCES exams (code) ON DELETE CASCADE,
    topic_id            UUID NOT NULL REFERENCES topics (id) ON DELETE CASCADE,

    -- Supplied §65/§67. Stored per row, not as a global setting: after the formula changes,
    -- rows computed by the old one are still on disk and a reader has to know which
    -- produced the number it is looking at. Bumping this in code and recomputing is what
    -- makes a formula change auditable instead of silently rewriting history.
    algorithm_version   VARCHAR(20) NOT NULL,

    -- The PYQ window the figures below were computed over. Without these the appearance
    -- count is uninterpretable — 12 appearances means something different across 3 years
    -- than across 15.
    window_from_year    INT,
    window_to_year      INT,

    appearance_count    INT NOT NULL DEFAULT 0,
    -- The *derived* share of the paper, as distinct from exam_topics.weightage_percent.
    computed_weightage_percent NUMERIC(5,2),

    -- RISING / STABLE / FALLING / INSUFFICIENT_DATA. The last value is a real verdict and
    -- not an error: a topic with one tagged appearance has no trend, and saying "stable"
    -- there would be a fabrication.
    trend_direction     VARCHAR(20) NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    -- Signed. Negative = declining. Bounded to a readable range rather than left open so
    -- the admin console can render it without knowing the formula's scale.
    trend_score         NUMERIC(6,2),

    -- Supplied §67 auditability: the actual inputs the score was computed from, so a
    -- recommendation can be explained without re-running the job or guessing. JSONB rather
    -- than columns because the input set changes with the algorithm version, which is the
    -- whole reason the version is recorded.
    inputs              JSONB,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_topic_trend_exam_topic_version UNIQUE (exam_code, topic_id, algorithm_version),
    CONSTRAINT chk_topic_trend_direction
        CHECK (trend_direction IN ('RISING', 'STABLE', 'FALLING', 'INSUFFICIENT_DATA')),
    CONSTRAINT chk_topic_trend_weightage
        CHECK (computed_weightage_percent IS NULL
               OR (computed_weightage_percent >= 0 AND computed_weightage_percent <= 100)),
    CONSTRAINT chk_topic_trend_window
        CHECK (window_from_year IS NULL OR window_to_year IS NULL OR window_from_year <= window_to_year)
);

CREATE INDEX idx_topic_trend_exam_code ON topic_trend (exam_code);
CREATE INDEX idx_topic_trend_topic_id ON topic_trend (topic_id);

-- ------------------------------------------------------------------ Priority + override
-- TICKET-2107, and the constraint that shapes this whole table: supplied §66 requires that
-- an admin override **never overwrite the computed value in place**. So `system_priority`,
-- `admin_override` and `final_priority` are three separate columns, not one mutable field.
--
-- `final_priority` is stored, not computed on read, even though it is always
-- COALESCE(admin_override, system_priority). It is what every consumer sorts by, and
-- recomputing it in every query means every consumer has to re-implement the precedence
-- rule identically — the exact class of duplication that produced the marks-inheritance
-- bug in the exam structure work. A generated column would express this better, but a
-- plain column keeps it writable by the recalculation job in the same statement as the
-- inputs, and the invariant is asserted by the CHECK below instead.
CREATE TABLE topic_priority (
    id                  VARCHAR(80) PRIMARY KEY,
    exam_code           VARCHAR(30) NOT NULL REFERENCES exams (code) ON DELETE CASCADE,
    topic_id            UUID NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
    algorithm_version   VARCHAR(20) NOT NULL,

    -- 0-100. Computed from weightage, trend, and the student-independent parts of the
    -- signal. Never written by an admin.
    system_priority     NUMERIC(5,2),
    -- 0-100. Written *only* by an admin. NULL = no override, which is different from an
    -- override of 0 ("explicitly deprioritise this") — hence nullable rather than defaulted.
    admin_override      NUMERIC(5,2),
    final_priority      NUMERIC(5,2),

    -- Required alongside an override so a later reader can tell a deliberate editorial
    -- decision from a stray edit. Enforced by the CHECK below, not just by the UI.
    override_reason     TEXT,
    override_by         UUID REFERENCES users (id) ON DELETE SET NULL,
    override_at         TIMESTAMPTZ,

    inputs              JSONB,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_topic_priority_exam_topic_version UNIQUE (exam_code, topic_id, algorithm_version),
    CONSTRAINT chk_topic_priority_system
        CHECK (system_priority IS NULL OR (system_priority >= 0 AND system_priority <= 100)),
    CONSTRAINT chk_topic_priority_override
        CHECK (admin_override IS NULL OR (admin_override >= 0 AND admin_override <= 100)),
    -- An override with no stated reason is unauditable, which defeats the point of storing
    -- it separately in the first place.
    CONSTRAINT chk_topic_priority_override_reason
        CHECK (admin_override IS NULL OR (override_reason IS NOT NULL AND btrim(override_reason) <> '')),
    -- The precedence rule, asserted rather than trusted. If a future writer forgets it,
    -- this fails loudly instead of quietly serving a wrong ordering to every student.
    CONSTRAINT chk_topic_priority_final
        CHECK (final_priority IS NOT DISTINCT FROM COALESCE(admin_override, system_priority))
);

CREATE INDEX idx_topic_priority_exam_code ON topic_priority (exam_code, final_priority DESC);
CREATE INDEX idx_topic_priority_topic_id ON topic_priority (topic_id);
-- The admin console's "what have we overridden" view.
CREATE INDEX idx_topic_priority_overridden ON topic_priority (exam_code)
    WHERE admin_override IS NOT NULL;
