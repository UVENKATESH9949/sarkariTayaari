-- The Practice/Mock Test exam cards were designed with a difficulty stat pill ("Medium
-- level") and an editorial tag ("TRENDING"/"POPULAR"), but neither existed as data, so
-- both were omitted from the redesign rather than faked. This adds them.
--
-- difficulty reuses the existing difficulty_levels table rather than introducing a
-- second difficulty vocabulary: the codes, labels, colours and icons an admin already
-- curates there are exactly what the card needs to render, and reusing them means an
-- exam's difficulty can never disagree with a question's.
--
-- badge gets its own lookup table for the same reason questions.difficulty got one in
-- V3 — a free-form VARCHAR would let a typo save cleanly and then render nowhere, and a
-- hardcoded enum would mean a release to add "NEW". Both columns are nullable: most
-- exams have neither, and an unset value must stay renderable-as-absent, not default to
-- a wrong one.

-- ------------------------------------------------------------------ Exam badges
CREATE TABLE exam_badges (
    code           VARCHAR(20) PRIMARY KEY,
    label          VARCHAR(50) NOT NULL,
    display_order  INT NOT NULL DEFAULT 0,
    color          VARCHAR(20),
    color_bg       VARCHAR(20),
    is_active      BOOLEAN NOT NULL DEFAULT true
);

-- Seeded to match the two tones the mobile Badge component already renders: a warm
-- "hot" tone for urgency and a green tone for endorsement.
INSERT INTO exam_badges (code, label, display_order, color, color_bg) VALUES
    ('trending', 'Trending', 1, '#FF8A65', '#3A1E1E'),
    ('popular',  'Popular',  2, '#4ADE80', '#12312A'),
    ('new',      'New',      3, '#4ADE80', '#12312A');

-- ------------------------------------------------------------------ Exam columns
ALTER TABLE exams ADD COLUMN difficulty VARCHAR(20);
ALTER TABLE exams ADD COLUMN badge      VARCHAR(20);

ALTER TABLE exams
    ADD CONSTRAINT fk_exams_difficulty
    FOREIGN KEY (difficulty) REFERENCES difficulty_levels (code);

ALTER TABLE exams
    ADD CONSTRAINT fk_exams_badge
    FOREIGN KEY (badge) REFERENCES exam_badges (code);
