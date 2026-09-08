-- Multi-type question architecture, Phase P2 Wave B (TASK-2301). Enables NUMERIC,
-- FILL_BLANK, MATCH and ORDERING for authoring.
--
-- No new columns, unlike Wave A (V26). The response model (response/outcome/
-- score_fraction/question_type) already exists and is type-agnostic; the three generic
-- JSONB columns questions already carries since V25 (answer_key, answer_config,
-- content_structure) already have everything these four types need. content_structure
-- goes from theoretical to actually used for the first time here: MATCH stores its
-- left/right item keys there, ORDERING its item keys — the stable, language-independent
-- identifiers translations key their per-language labels against and answerKey
-- references by id rather than by a fixed A-D position, since both types have an
-- admin-defined, variable number of things to key (unlike every OPTION_SET-family type,
-- which always has exactly 4 fixed options).
UPDATE question_types
SET is_authoring_enabled = true
WHERE code IN ('NUMERIC', 'FILL_BLANK', 'MATCH', 'ORDERING');
