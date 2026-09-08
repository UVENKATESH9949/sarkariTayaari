-- Multi-type question architecture, Phase P1 (TASK-2301,
-- tasks/TASK-2301-multi-type-question-architecture.md). Foundation only: adds a type
-- discriminator and three JSONB columns to `questions`, plus a `question_types` reference
-- table with only SINGLE_CHOICE enabled for authoring. Nothing new is authorable yet --
-- every one of the ~37,884 existing questions is backfilled to SINGLE_CHOICE and keeps
-- working through the untouched `correct_answer`/`options` columns exactly as before.
--
-- Deliberately NOT in this migration, and why: `user_practice_session_results` and
-- `user_mock_attempt_results` (the response-model tables) are not touched here. The
-- architecture proposal's P1 called for adding `response`/`outcome`/`score_fraction` and
-- relaxing `selected_index` to nullable on both, but nothing that exists today would ever
-- write a null selected_index -- SINGLE_CHOICE is the only authorable type, and it always
-- produces a real option index. Making that column nullable now, with nothing to exercise
-- the null path, would be exactly the kind of change §19 (of AI_RULES.md) and this table's
-- own Weakness Radar history warn about: a schema change with no way to prove it correct
-- until a later phase actually needs it. That slice moves to whichever P2 wave introduces
-- the first type with a non-index answer (NUMERIC/FILL_BLANK/MATCH/ORDERING) -- see the task
-- doc's Implementation status for this decision recorded in full, including the two
-- COALESCE bridge sites (TopicEvidenceRepository.java, mobile/src/intelligence/
-- localEvidence.ts) that must change in the same commit as that later migration.

-- --------------------------------------------------------------- Question type registry
-- Same shape as difficulty_levels (V3): a real table, not a bare enum, because an admin
-- needs to see labels and disable a type without a code deploy -- but every row is also
-- validated against the Java QuestionType enum before anything type-specific runs on it, so
-- this table can disable a type, never invent one the code doesn't know how to render.
CREATE TABLE question_types (
    code                       VARCHAR(40) PRIMARY KEY,
    label                      VARCHAR(80) NOT NULL,
    evaluator_family           VARCHAR(40) NOT NULL,
    is_authoring_enabled       BOOLEAN NOT NULL DEFAULT false,
    default_negative_marking   BOOLEAN NOT NULL DEFAULT true,
    display_order              INT NOT NULL DEFAULT 0
);

-- Every type the architecture proposal names, seeded now so P2/P3 are data changes
-- (flip is_authoring_enabled) rather than new migrations -- but only SINGLE_CHOICE is
-- enabled today, matching "nothing new is authorable yet".
INSERT INTO question_types (code, label, evaluator_family, is_authoring_enabled, default_negative_marking, display_order) VALUES
    ('SINGLE_CHOICE',          'Single Choice',            'OPTION_SET', true,  true,  1),
    ('MULTIPLE_CHOICE',        'Multiple Choice',          'OPTION_SET', false, true,  2),
    ('TRUE_FALSE',             'True / False',             'OPTION_SET', false, true,  3),
    ('ASSERTION_REASON',       'Assertion & Reason',       'OPTION_SET', false, true,  4),
    ('STATEMENT_COMBINATION',  'Statement-Based',          'OPTION_SET', false, true,  5),
    ('NUMERIC',                'Numerical Answer',         'NUMERIC',    false, false, 6),
    ('FILL_BLANK',             'Fill in the Blank',        'TEXT',       false, false, 7),
    ('MATCH',                  'Match the Following',      'MAPPING',    false, true,  8),
    ('ORDERING',               'Ordering / Sequence',      'SEQUENCE',   false, true,  9),
    ('SHORT_ANSWER',           'Short Answer',              'MANUAL',    false, false, 10),
    ('LONG_ANSWER',            'Long / Descriptive Answer', 'MANUAL',    false, false, 11);

-- ---------------------------------------------------------------- questions extensions
ALTER TABLE questions ADD COLUMN question_type VARCHAR(40) NOT NULL DEFAULT 'SINGLE_CHOICE';
ALTER TABLE questions ADD COLUMN answer_key JSONB;
ALTER TABLE questions ADD COLUMN answer_config JSONB;
ALTER TABLE questions ADD COLUMN content_structure JSONB;

ALTER TABLE questions
    ADD CONSTRAINT fk_questions_question_type
    FOREIGN KEY (question_type) REFERENCES question_types (code);

CREATE INDEX idx_questions_question_type ON questions (question_type);

-- ---------------------------------------------------------------------------- Backfill
-- Every existing row is, by definition, a single-correct MCQ. `answer_key` mirrors
-- `correct_answer` in structured form -- `correct_answer` stays the column every existing
-- read/write path actually uses; `answer_key` is a forward-looking projection nothing
-- reads yet (the evaluator is not wired into the live scoring path in this phase).

-- Primary case: correct_answer is a clean A-D letter (the overwhelming majority of rows).
UPDATE questions
SET answer_key = jsonb_build_object('correctOption', ascii(upper(left(trim(correct_answer), 1))) - 65)
WHERE answer_key IS NULL
  AND upper(trim(correct_answer)) ~ '^[A-D]$';

-- Fallback: correct_answer holds the literal option value instead of a letter -- a known,
-- small data-quality issue this codebase already works around client-side
-- (mobile/src/db/answerResolution.ts's resolveCorrectIndex, admin's toAnswerLetter).
-- Resolved here the same way: match the English translation's option array positionally.
--
-- The correlation against q.correct_answer has to live in the outer WHERE, not inside a
-- LATERAL subquery's own filter -- Postgres does not allow an UPDATE's target table to be
-- referenced from inside a LATERAL item in its FROM list ("invalid reference to FROM-clause
-- entry", found by actually running this migration, not assumed). `elem(val, idx)` is
-- implicitly LATERAL here because it reads qt.options from the preceding FROM item, with no
-- explicit LATERAL keyword needed for a bare set-returning function call.
UPDATE questions q
SET answer_key = jsonb_build_object('correctOption', elem.idx - 1)
FROM question_translations qt,
     jsonb_array_elements_text(qt.options) WITH ORDINALITY AS elem(val, idx)
WHERE q.answer_key IS NULL
  AND qt.question_id = q.id
  AND qt.language_code = 'en'
  AND trim(elem.val) = trim(q.correct_answer);

-- Rows that still have no answer_key (correct_answer neither a letter nor matching any
-- English option text) are a genuine, pre-existing data-quality problem -- left as NULL
-- rather than guessed at, matching resolveCorrectIndex's own refusal to invent an answer.
-- QuestionTypeFoundationTest asserts the count of these against this database's real data.
