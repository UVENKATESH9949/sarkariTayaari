-- New "Exams" discovery module needs a category facet (SSC/Banking/Railways/UPSC/etc.)
-- to filter by -- confirmed absent anywhere in the data model before this (checked
-- Exam.java, the admin form, and the mobile schema directly). A plain string, not a
-- native enum or a new lookup table: unlike difficulty_levels/exam_badges, a category
-- needs no per-value color/icon styling of its own, just a filter facet.
ALTER TABLE exams ADD COLUMN category VARCHAR(30);
