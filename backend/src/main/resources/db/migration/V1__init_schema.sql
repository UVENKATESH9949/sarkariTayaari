CREATE TABLE languages (
    code       VARCHAR(10) PRIMARY KEY,
    name       VARCHAR(50) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO languages (code, name, is_active) VALUES
    ('en', 'English', true),
    ('hi', 'Hindi', true);

CREATE TABLE questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correct_answer  VARCHAR(10) NOT NULL,
    topic           VARCHAR(100) NOT NULL,
    difficulty      VARCHAR(20) NOT NULL,
    exam_type       VARCHAR(20) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_questions_topic ON questions (topic);
CREATE INDEX idx_questions_difficulty ON questions (difficulty);
CREATE INDEX idx_questions_exam_type ON questions (exam_type);
CREATE INDEX idx_questions_updated_at ON questions (updated_at);

CREATE TABLE question_translations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id    UUID NOT NULL REFERENCES questions (id),
    language_code  VARCHAR(10) NOT NULL REFERENCES languages (code),
    question_text  TEXT NOT NULL,
    options        JSONB NOT NULL,
    explanation    TEXT,
    UNIQUE (question_id, language_code)
);

CREATE INDEX idx_question_translations_question_id ON question_translations (question_id);
