-- Exam structure (Stage → Paper → Section → Subjects) plus the reference tables that
-- move remaining exam-domain facts out of client code and into admin-managed data.
-- See Section 7 of offline-exam-app-requirements.md for the design rationale.

-- ---------------------------------------------------------------- Difficulty levels

-- questions.difficulty was a free-form VARCHAR with no enum and no table: the server
-- accepted any string while both clients hardcoded exactly three, so a typo saved
-- cleanly and then rendered nowhere. Promoting it to a real FK makes that an error.
CREATE TABLE difficulty_levels (
    code           VARCHAR(20) PRIMARY KEY,
    label          VARCHAR(50) NOT NULL,
    display_order  INT NOT NULL DEFAULT 0,
    color          VARCHAR(20),
    color_bg       VARCHAR(20),
    icon           VARCHAR(50),
    is_active      BOOLEAN NOT NULL DEFAULT true
);

-- Seeded to match the colours/icons the mobile Levels screen currently hardcodes,
-- so promoting this to data changes nothing visually.
INSERT INTO difficulty_levels (code, label, display_order, color, color_bg, icon) VALUES
    ('easy',   'Easy',   1, '#2f9e64', '#e8f7f0', 'leaf-outline'),
    ('medium', 'Medium', 2, '#c9861f', '#fdf3e2', 'speedometer-outline'),
    ('hard',   'Hard',   3, '#c94f4f', '#fdecec', 'flame-outline');

-- Safe without a data cleanup step: verified against the live database that every
-- question holds easy/medium/hard and nothing else.
ALTER TABLE questions
    ADD CONSTRAINT fk_questions_difficulty
    FOREIGN KEY (difficulty) REFERENCES difficulty_levels (code);

-- --------------------------------------------------------------------- Paper types

-- Drives whether a paper can be mock-tested at all: UPSC Mains is nine descriptive
-- papers, and the app should show that structure honestly rather than try to
-- generate an MCQ test from it.
CREATE TABLE paper_types (
    code           VARCHAR(30) PRIMARY KEY,
    label          VARCHAR(60) NOT NULL,
    is_mockable    BOOLEAN NOT NULL DEFAULT false,
    display_order  INT NOT NULL DEFAULT 0
);

INSERT INTO paper_types (code, label, is_mockable, display_order) VALUES
    ('objective',   'Objective (MCQ)',              true,  1),
    ('descriptive', 'Descriptive',                  false, 2),
    ('skill',       'Skill / Typing Test',          false, 3),
    ('interview',   'Interview / Personality Test', false, 4);

-- ------------------------------------------------- Ordering and styling as real data

ALTER TABLE subjects ADD COLUMN display_order INT NOT NULL DEFAULT 0;
ALTER TABLE subjects ADD COLUMN icon      VARCHAR(50);
ALTER TABLE subjects ADD COLUMN color     VARCHAR(20);
ALTER TABLE subjects ADD COLUMN color_bg  VARCHAR(20);
ALTER TABLE topics   ADD COLUMN display_order INT NOT NULL DEFAULT 0;

-- Backfilled from mobile/src/constants/subjects.ts so the app looks identical after
-- the switch. Subjects added later get a neutral fallback until an admin styles them.
UPDATE subjects SET display_order = 1, icon = 'calculator-outline', color = '#4c5fd5', color_bg = '#eef2ff' WHERE name = 'Quantitative Aptitude';
UPDATE subjects SET display_order = 2, icon = 'bulb-outline',       color = '#8b4cd5', color_bg = '#f3e8fd' WHERE name = 'Reasoning';
UPDATE subjects SET display_order = 3, icon = 'language-outline',   color = '#2f9e64', color_bg = '#e8f7f0' WHERE name = 'English';
UPDATE subjects SET display_order = 4, icon = 'newspaper-outline',  color = '#d5824c', color_bg = '#fdf0e8' WHERE name = 'General Awareness';
UPDATE subjects SET display_order = 5, icon = 'laptop-outline',     color = '#2f7fd5', color_bg = '#e8f3fd' WHERE name = 'Computer Knowledge';
UPDATE subjects SET display_order = 6, icon = 'flask-outline',      color = '#d5477e', color_bg = '#fdeaf0' WHERE name = 'General Science';

-- ------------------------------------------------------------------ Exam structure

CREATE TABLE exam_stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_code       VARCHAR(30) NOT NULL REFERENCES exams (code),
    name            VARCHAR(100) NOT NULL,
    display_order   INT NOT NULL DEFAULT 0,
    -- Exam patterns change between years (SSC CGL Tier 2 was restructured in 2022).
    -- Carried from the start so introducing real versioning later is additive.
    effective_from  DATE,
    version_label   VARCHAR(50),
    UNIQUE (exam_code, name)
);

CREATE INDEX idx_exam_stages_exam_code ON exam_stages (exam_code);

CREATE TABLE exam_papers (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Stage/paper/section are pure composition: a paper is meaningless without its
    -- stage, so structural deletes cascade. Exams deliberately do NOT cascade into
    -- stages — deleting an exam that has a pattern should fail loudly instead.
    stage_id               UUID NOT NULL REFERENCES exam_stages (id) ON DELETE CASCADE,
    name                   VARCHAR(150) NOT NULL,
    paper_type             VARCHAR(30) NOT NULL REFERENCES paper_types (code),
    duration_minutes       INT,
    total_marks            NUMERIC(8,2),
    marks_correct          NUMERIC(6,2),
    marks_wrong            NUMERIC(6,2),
    is_qualifying          BOOLEAN NOT NULL DEFAULT false,
    qualifying_percentage  NUMERIC(5,2),
    display_order          INT NOT NULL DEFAULT 0,
    UNIQUE (stage_id, name)
);

CREATE INDEX idx_exam_papers_stage_id ON exam_papers (stage_id);

CREATE TABLE paper_sections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id          UUID NOT NULL REFERENCES exam_papers (id) ON DELETE CASCADE,
    name              VARCHAR(150) NOT NULL,
    question_count    INT NOT NULL DEFAULT 0,
    -- NULL = section shares the paper's overall time (SSC). A value = the section is
    -- separately timed and enforced (IBPS).
    duration_minutes  INT,
    -- NULL = inherit the paper's marking. Set = override for this section only
    -- (SSC CGL Tier 2 marks modules differently within one paper).
    marks_correct     NUMERIC(6,2),
    marks_wrong       NUMERIC(6,2),
    display_order     INT NOT NULL DEFAULT 0,
    UNIQUE (paper_id, name)
);

CREATE INDEX idx_paper_sections_paper_id ON paper_sections (paper_id);

-- Many-to-many: UPSC's single "General Studies" section spans several subjects,
-- while an SSC section maps to exactly one.
CREATE TABLE section_subjects (
    section_id  UUID NOT NULL REFERENCES paper_sections (id) ON DELETE CASCADE,
    subject_id  UUID NOT NULL REFERENCES subjects (id),
    PRIMARY KEY (section_id, subject_id)
);

CREATE INDEX idx_section_subjects_subject_id ON section_subjects (subject_id);

-- ------------------------------------------------------- Seed: SSC CGL Tier 1

-- Reproduces mobile/src/mockTest/blueprints.ts exactly (60 minutes, +2/-0.5,
-- 4 sections x 25 questions) so the existing Mock Test cannot regress. Section names
-- use the real paper's wording, which is why the subject mapping below is explicit
-- rather than a name match.
INSERT INTO exam_stages (exam_code, name, display_order, version_label)
VALUES ('SSC_CGL', 'Tier 1', 1, 'Current pattern');

INSERT INTO exam_papers (stage_id, name, paper_type, duration_minutes, total_marks, marks_correct, marks_wrong, display_order)
SELECT s.id, 'Tier 1 (Computer Based Examination)', 'objective', 60, 200, 2, 0.5, 1
FROM exam_stages s
WHERE s.exam_code = 'SSC_CGL' AND s.name = 'Tier 1';

INSERT INTO paper_sections (paper_id, name, question_count, display_order)
SELECT p.id, v.section_name, v.question_count, v.display_order
FROM exam_papers p
JOIN exam_stages s ON s.id = p.stage_id
CROSS JOIN (VALUES
    ('General Intelligence and Reasoning', 25, 1),
    ('General Awareness',                  25, 2),
    ('Quantitative Aptitude',              25, 3),
    ('English Comprehension',              25, 4)
) AS v(section_name, question_count, display_order)
WHERE s.exam_code = 'SSC_CGL' AND s.name = 'Tier 1';

INSERT INTO section_subjects (section_id, subject_id)
SELECT sec.id, subj.id
FROM paper_sections sec
JOIN exam_papers p ON p.id = sec.paper_id
JOIN exam_stages s ON s.id = p.stage_id
JOIN (VALUES
    ('General Intelligence and Reasoning', 'Reasoning'),
    ('General Awareness',                  'General Awareness'),
    ('Quantitative Aptitude',              'Quantitative Aptitude'),
    ('English Comprehension',              'English')
) AS m(section_name, subject_name) ON m.section_name = sec.name
JOIN subjects subj ON subj.name = m.subject_name
WHERE s.exam_code = 'SSC_CGL' AND s.name = 'Tier 1';

-- ------------------------------------------------- Seed: IBPS PO Preliminary

-- Seeded specifically to exercise per-section timing before the model is trusted:
-- each section has its own 20-minute limit rather than sharing the paper's hour.
INSERT INTO exam_stages (exam_code, name, display_order, version_label)
VALUES ('IBPS_PO', 'Preliminary', 1, 'Current pattern');

INSERT INTO exam_papers (stage_id, name, paper_type, duration_minutes, total_marks, marks_correct, marks_wrong, display_order)
SELECT s.id, 'Preliminary Examination', 'objective', 60, 100, 1, 0.25, 1
FROM exam_stages s
WHERE s.exam_code = 'IBPS_PO' AND s.name = 'Preliminary';

INSERT INTO paper_sections (paper_id, name, question_count, duration_minutes, display_order)
SELECT p.id, v.section_name, v.question_count, v.duration_minutes, v.display_order
FROM exam_papers p
JOIN exam_stages s ON s.id = p.stage_id
CROSS JOIN (VALUES
    ('English Language',      30, 20, 1),
    ('Quantitative Aptitude', 35, 20, 2),
    ('Reasoning Ability',     35, 20, 3)
) AS v(section_name, question_count, duration_minutes, display_order)
WHERE s.exam_code = 'IBPS_PO' AND s.name = 'Preliminary';

INSERT INTO section_subjects (section_id, subject_id)
SELECT sec.id, subj.id
FROM paper_sections sec
JOIN exam_papers p ON p.id = sec.paper_id
JOIN exam_stages s ON s.id = p.stage_id
JOIN (VALUES
    ('English Language',      'English'),
    ('Quantitative Aptitude', 'Quantitative Aptitude'),
    ('Reasoning Ability',     'Reasoning')
) AS m(section_name, subject_name) ON m.section_name = sec.name
JOIN subjects subj ON subj.name = m.subject_name
WHERE s.exam_code = 'IBPS_PO' AND s.name = 'Preliminary';
