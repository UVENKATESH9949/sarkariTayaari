-- V9's round-robin seed under-filled the pool (254 questions rather than ~500): it ranked
-- per (question, exam) pair, so a question tagged to several active exams competed for a
-- quota slot under each exam and then collided on insert (ON CONFLICT DO NOTHING silently
-- dropped the duplicates). This corrects the selection to rank distinct questions — each
-- assigned to a single representative exam (its alphabetically-first active exam tag) —
-- so the pool actually reaches its ~500 target. Clears the smaller V9 seed first: this
-- feature has no installed base yet, so there's nothing relying on the original ids.
DELETE FROM temporary_question_pool;

WITH primary_exam AS (
    SELECT DISTINCT ON (qet.question_id)
        qet.question_id,
        qet.exam_code,
        q.updated_at
    FROM question_exam_types qet
    JOIN questions q ON q.id = qet.question_id
    JOIN exams e ON e.code = qet.exam_code
    WHERE q.is_deleted = false
      AND e.is_active = true
    ORDER BY qet.question_id, qet.exam_code
),
ranked AS (
    SELECT
        question_id,
        ROW_NUMBER() OVER (PARTITION BY exam_code ORDER BY updated_at) AS rn
    FROM primary_exam
)
INSERT INTO temporary_question_pool (question_id)
SELECT question_id FROM ranked
WHERE rn <= CEIL(500.0 / GREATEST((SELECT COUNT(*) FROM exams WHERE is_active = true), 1))
ORDER BY rn
LIMIT 500;
