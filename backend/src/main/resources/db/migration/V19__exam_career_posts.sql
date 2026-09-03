-- Exam Guide spec §25/§26 "Career Information" and "Career Growth" — genuinely new content,
-- unlike Phase 1's other sections, none of which had career/salary data anywhere in this
-- schema (confirmed by grep before writing this migration).
--
-- Exam-scoped, NOT recruitment-cycle-scoped: unlike dates/fees/eligibility, which cycle's
-- rules apply for a given year, the posts a passing candidate can be assigned to and their
-- pay/growth path don't reset every recruitment round -- they're a property of the exam
-- itself. One exam can lead to multiple posts (e.g. SSC CGL recruits for several different
-- posts at once), so this is a list, not a single row per exam.
--
-- growth_path is plain text, like qualification/special_requirements on eligibility_rules
-- (V17) -- a structured stage-by-stage model was considered and deliberately not built: it
-- would be new UI and new admin form complexity for content that is, in practice, a short
-- paragraph an admin writes once per post.
CREATE TABLE exam_career_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_code         VARCHAR(30) NOT NULL REFERENCES exams (code),
    post_title        VARCHAR(150) NOT NULL,
    pay_level         VARCHAR(100),
    salary_min_rupees INT,
    salary_max_rupees INT,
    growth_path       TEXT,
    description       TEXT,
    source_id         UUID REFERENCES exam_sources (id) ON DELETE SET NULL,
    display_order     INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_exam_career_posts_exam_code ON exam_career_posts (exam_code, display_order);
