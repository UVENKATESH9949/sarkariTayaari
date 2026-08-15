-- Remove the one known leftover manual-test row (topic='Test', exam_type='TEST', already
-- soft-deleted) before restructuring, so it can't break the topic/exam backfill below.
DELETE FROM question_translations WHERE question_id IN (
    SELECT id FROM questions WHERE topic = 'Test' AND exam_type = 'TEST'
);
DELETE FROM questions WHERE topic = 'Test' AND exam_type = 'TEST';

-- Exams are real data (like languages), not a hardcoded enum — adding a new exam later
-- is a data insert, not a code change.
CREATE TABLE exams (
    code           VARCHAR(30) PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    image_url      TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT false,
    display_order  INT NOT NULL DEFAULT 0
);

INSERT INTO exams (code, name, is_active, display_order) VALUES
    ('SSC_CGL', 'SSC CGL', true, 1),
    ('SSC_CHSL', 'SSC CHSL', false, 2),
    ('IBPS_PO', 'IBPS PO', false, 3),
    ('IBPS_CLERK', 'IBPS Clerk', false, 4),
    ('RRB_NTPC', 'RRB NTPC', false, 5),
    ('RRB_GROUP_D', 'RRB Group D', false, 6);

-- Subjects are global and shared across every exam — authored once, reused everywhere
-- they're relevant, instead of duplicated per exam.
CREATE TABLE subjects (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name  VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO subjects (name) VALUES
    ('Quantitative Aptitude'),
    ('Reasoning'),
    ('English'),
    ('General Awareness'),
    ('Computer Knowledge'),
    ('General Science');

-- Topics are sub-topics within a subject (e.g. "Percentages" under Quantitative Aptitude),
-- also global. One placeholder "General" topic per subject holds existing seed questions
-- until real sub-topics are authored.
CREATE TABLE topics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id  UUID NOT NULL REFERENCES subjects (id),
    name        VARCHAR(100) NOT NULL,
    UNIQUE (subject_id, name)
);

INSERT INTO topics (subject_id, name)
SELECT id, 'General' FROM subjects;

-- Move questions from flat topic/exam_type strings to a normalized topic FK plus a
-- many-to-many exam tag set (a question can belong to multiple exams at once — most
-- of the syllabus is shared across exams, so content is authored once and tagged
-- to every exam it's relevant to, instead of duplicated per exam).
ALTER TABLE questions ADD COLUMN topic_id UUID;
ALTER TABLE questions ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT false;

UPDATE questions q
SET topic_id = t.id
FROM topics t
JOIN subjects s ON s.id = t.subject_id
WHERE s.name = q.topic AND t.name = 'General';

ALTER TABLE questions ALTER COLUMN topic_id SET NOT NULL;
ALTER TABLE questions ADD CONSTRAINT fk_questions_topic FOREIGN KEY (topic_id) REFERENCES topics (id);
CREATE INDEX idx_questions_topic_id ON questions (topic_id);

CREATE TABLE question_exam_types (
    question_id  UUID NOT NULL REFERENCES questions (id),
    exam_code    VARCHAR(30) NOT NULL REFERENCES exams (code),
    PRIMARY KEY (question_id, exam_code)
);

INSERT INTO question_exam_types (question_id, exam_code)
SELECT id, exam_type FROM questions;

DROP INDEX idx_questions_topic;
DROP INDEX idx_questions_exam_type;
ALTER TABLE questions DROP COLUMN topic;
ALTER TABLE questions DROP COLUMN exam_type;
