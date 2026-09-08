-- Multi-type question architecture, Phase P2 Wave A (TASK-2301). Enables MULTIPLE_CHOICE,
-- TRUE_FALSE, ASSERTION_REASON and STATEMENT_COMBINATION for authoring, and lands the
-- response-model slice explicitly deferred out of P1 (V25's own comment) because nothing
-- authorable at the time would ever have exercised it. It is needed now: MULTIPLE_CHOICE's
-- answer is a set, TRUE_FALSE's is a boolean, and neither fits `selected_index INT`.

-- --------------------------------------------------------- Per-language authored content
-- Assertion & Reason's assertion/reason text, and Statement-Based's statement list, are
-- per-language authored text that does not fit the flat `options` array (options for those
-- two types stay the fixed relationship/combination phrases, e.g. "Both A and R are true
-- and R is the correct explanation of A" -- unchanged, still 4 per language). `content` is
-- the per-language counterpart to `questions.content_structure` (V25) -- language-dependent
-- where content_structure is language-independent, same split as question_translations vs
-- questions everywhere else in this schema.
ALTER TABLE question_translations ADD COLUMN content JSONB;

-- ------------------------------------------------------------- Enable Wave A for authoring
UPDATE question_types
SET is_authoring_enabled = true
WHERE code IN ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'ASSERTION_REASON', 'STATEMENT_COMBINATION');

-- ---------------------------------------------------------------------- Response model
-- Both result tables gain the same four columns. `response` is the generic, type-shaped
-- answer ({"selectedOption": 1} / {"selectedOptions": [0,2]} / {"selectedBoolean": false});
-- `outcome` and `score_fraction` are QuestionEvaluator's output, stored rather than
-- recomputed on every read; `question_type` records what evaluated it, for §16-style
-- analytics and so a reader never has to guess.
--
-- `selected_index`/`correct_index` are KEPT, not replaced -- they stay populated exactly as
-- before for every SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION row (all three are
-- genuinely single-index answers under the hood), which is what lets every existing read
-- site that has not been touched yet (admin displays, TopicEvidenceRepository's PRACTICE
-- query, which reads the already-type-agnostic is_correct boolean) keep working unchanged.
-- They are NULL only for MULTIPLE_CHOICE/TRUE_FALSE rows, where they have no meaning.
ALTER TABLE user_practice_session_results ADD COLUMN response JSONB;
ALTER TABLE user_practice_session_results ADD COLUMN outcome VARCHAR(20);
ALTER TABLE user_practice_session_results ADD COLUMN score_fraction NUMERIC(4,3);
ALTER TABLE user_practice_session_results ADD COLUMN question_type VARCHAR(40);
ALTER TABLE user_practice_session_results ALTER COLUMN selected_index DROP NOT NULL;
ALTER TABLE user_practice_session_results ALTER COLUMN correct_index DROP NOT NULL;

ALTER TABLE user_mock_attempt_results ADD COLUMN response JSONB;
ALTER TABLE user_mock_attempt_results ADD COLUMN outcome VARCHAR(20);
ALTER TABLE user_mock_attempt_results ADD COLUMN score_fraction NUMERIC(4,3);
ALTER TABLE user_mock_attempt_results ADD COLUMN question_type VARCHAR(40);
-- selected_index is already nullable here (V6) -- unattempted mock questions always were.
ALTER TABLE user_mock_attempt_results ALTER COLUMN correct_index DROP NOT NULL;

-- Backfill: every existing row predates this migration and is SINGLE_CHOICE. Populated for
-- every row, old and new, so every future reader can trust `outcome` unconditionally instead
-- of falling back to the legacy columns for rows written before this release -- the backfill
-- reconciles history once here rather than every query doing it forever.
UPDATE user_practice_session_results
SET question_type = 'SINGLE_CHOICE',
    response = jsonb_build_object('selectedOption', selected_index),
    outcome = CASE WHEN is_correct THEN 'CORRECT' ELSE 'INCORRECT' END,
    score_fraction = CASE WHEN is_correct THEN 1.0 ELSE 0.0 END
WHERE question_type IS NULL;

-- Mock rows: selected_index IS NULL already means "left unattempted" (V6) -- preserved as
-- UNATTEMPTED / a null response, not coerced into a wrong answer.
UPDATE user_mock_attempt_results
SET question_type = 'SINGLE_CHOICE',
    response = CASE WHEN selected_index IS NULL THEN NULL
                     ELSE jsonb_build_object('selectedOption', selected_index) END,
    outcome = CASE
        WHEN selected_index IS NULL THEN 'UNATTEMPTED'
        WHEN selected_index = correct_index THEN 'CORRECT'
        ELSE 'INCORRECT'
    END,
    score_fraction = CASE WHEN selected_index IS NOT NULL AND selected_index = correct_index
                           THEN 1.0 ELSE 0.0 END
WHERE question_type IS NULL;
