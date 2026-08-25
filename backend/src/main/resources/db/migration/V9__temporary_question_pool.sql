-- Temporary bounded question pool: syncing the full ~37,900-question bank on every fresh
-- install is slow, network-heavy, and expensive to serve for no real benefit right now.
-- This table names ~500 questions, spread round-robin across every active exam so
-- Practice and Mock Test both have real, varied content immediately. Membership is a
-- one-time seed, not admin-managed — this is a deliberate, temporary dev/testing measure,
-- not a permanent feature. Toggle app.question-pool.temporary-enabled to false (or reseed
-- this table with more ids) to grow the pool later without any code change.
CREATE TABLE temporary_question_pool (
    question_id UUID PRIMARY KEY REFERENCES questions (id)
);

INSERT INTO temporary_question_pool (question_id)
SELECT question_id FROM (
    SELECT
        qet.question_id,
        ROW_NUMBER() OVER (
            PARTITION BY qet.exam_code
            ORDER BY q.updated_at
        ) AS rn
    FROM question_exam_types qet
    JOIN questions q ON q.id = qet.question_id
    JOIN exams e ON e.code = qet.exam_code
    WHERE q.is_deleted = false
      AND e.is_active = true
) ranked
WHERE rn <= CEIL(500.0 / GREATEST((SELECT COUNT(*) FROM exams WHERE is_active = true), 1))
ORDER BY rn
LIMIT 500
ON CONFLICT (question_id) DO NOTHING;
