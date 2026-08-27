-- Epic L, phase 0 of the Preparation Plan engine (TICKET-2101/2102/2103). See
-- preparation-os-requirements.md §18.3. This is prerequisite schema, not a feature:
-- Epics A/C/D/F all assume a per-exam, hierarchical, dependency-aware topic model that
-- does not exist yet. The audit recorded in §18.2 found the hierarchy is exactly
-- Subject -> Topic, topics reach exams only transitively through their subject, and there
-- is no notion of one topic requiring another.
--
-- Nothing here is destructive and nothing is backfilled with invented data: every column
-- and table added is nullable or empty, so existing behaviour is unchanged until an admin
-- curates real values.

-- ------------------------------------------------------------------ Topic hierarchy
-- TICKET-2102. One self-referencing parent instead of the four separate
-- Chapter/Topic/SubTopic/Concept tables the source spec proposed: depth genuinely varies
-- by subject (Quant needs Chapter->Topic->Sub-topic, English often does not), and a fixed
-- ladder would force empty levels while a recursive relation lets each subject use only
-- the depth it needs. NULL parent = a top-level topic, which is what every existing row
-- becomes.
ALTER TABLE topics ADD COLUMN parent_id UUID;

ALTER TABLE topics
    ADD CONSTRAINT fk_topics_parent
    FOREIGN KEY (parent_id) REFERENCES topics (id);

CREATE INDEX idx_topics_parent_id ON topics (parent_id);

-- ------------------------------------------------------------------ Exam <-> topic map
-- TICKET-2101, and the single biggest structural gap in §18.2: `exam_subjects` maps an
-- exam to a SUBJECT, so "which topics matter for SSC CGL" could only be answered at
-- subject granularity and no per-exam topic attribute could be stored at all.
--
-- weightage_percent is the admin's curated view of how much of the paper a topic is worth.
-- Deliberately nullable and deliberately NOT the same thing as the computed weightage
-- Epic L/TICKET-2106 will derive from previous-year questions — a human override and a
-- calculated value must stay distinguishable (source spec §66).
-- Synthetic "examCode:topicId" primary key rather than a composite (exam_code, topic_id)
-- one. This is not a style preference: ADR-005 records that a JPA @IdClass composite key
-- on user_bookmarks produced real 500s, because Hibernate's isNew() entity-state
-- detection misbehaves for a derived composite id. user_practice_session_results and
-- user_bookmarks both already use the synthetic-string form for exactly this reason.
-- The natural key keeps its own UNIQUE so the pair still cannot duplicate.
CREATE TABLE exam_topics (
    id                VARCHAR(80) PRIMARY KEY,
    exam_code         VARCHAR(30) NOT NULL REFERENCES exams (code),
    topic_id          UUID NOT NULL REFERENCES topics (id),
    weightage_percent NUMERIC(5,2),
    CONSTRAINT uq_exam_topics_exam_topic UNIQUE (exam_code, topic_id)
);

CREATE INDEX idx_exam_topics_exam_code ON exam_topics (exam_code);
CREATE INDEX idx_exam_topics_topic_id ON exam_topics (topic_id);

-- ------------------------------------------------------------------ Prerequisites
-- TICKET-2103. The DAG Epic D's sequencing needs so an advanced topic is never
-- recommended before its fundamentals (source spec §50). A composite PK prevents
-- duplicate edges; the CHECK prevents the one-node cycle. Longer cycles are not
-- expressible as a constraint and are validated in the service layer instead.
CREATE TABLE topic_prerequisites (
    topic_id              UUID NOT NULL REFERENCES topics (id),
    prerequisite_topic_id UUID NOT NULL REFERENCES topics (id),
    PRIMARY KEY (topic_id, prerequisite_topic_id),
    CONSTRAINT chk_topic_prerequisites_not_self CHECK (topic_id <> prerequisite_topic_id)
);

CREATE INDEX idx_topic_prerequisites_prerequisite ON topic_prerequisites (prerequisite_topic_id);
