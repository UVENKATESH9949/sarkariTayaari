-- Explicit exam ↔ subject syllabus.
--
-- Which subjects an exam covers and how its papers are structured are two different
-- statements. Until now the first could only be derived from the second, so an exam
-- had no syllabus at all until someone authored its full paper/section pattern —
-- SSC CHSL is active today with exactly that problem, and Practice falls back to
-- showing every subject for it.
--
-- Sections keep their own subject links: those drive per-section question selection
-- for mock tests and need finer granularity than "this exam covers this subject".
-- This table is the broader statement, and is kept a superset of them.
CREATE TABLE exam_subjects (
    exam_code   VARCHAR(30) NOT NULL REFERENCES exams (code),
    subject_id  UUID NOT NULL REFERENCES subjects (id),
    PRIMARY KEY (exam_code, subject_id)
);

CREATE INDEX idx_exam_subjects_subject_id ON exam_subjects (subject_id);

-- Backfill from the pattern that already exists so nothing regresses: every subject
-- currently reachable through an exam's sections becomes part of its syllabus.
INSERT INTO exam_subjects (exam_code, subject_id)
SELECT DISTINCT st.exam_code, ss.subject_id
FROM section_subjects ss
JOIN paper_sections sec ON sec.id = ss.section_id
JOIN exam_papers p ON p.id = sec.paper_id
JOIN exam_stages st ON st.id = p.stage_id;
