-- Epic L / TICKET-2108 — make exam pattern versioning real rather than decorative.
-- See preparation-os-requirements.md §18.3.
--
-- The §18.2 audit's finding, verbatim: `exam_stages.effective_from` and `version_label`
-- exist and are admin-editable, but they are **inert labels**. Nothing filters by them,
-- and `UNIQUE (exam_code, name)` from V3 actively *prevents* two versions of the same
-- stage name coexisting — so an admin literally cannot enter "Tier 2 (2022 pattern)"
-- alongside "Tier 2 (2018 pattern)". Until that constraint is relaxed, versioning is a
-- field you can type in and nothing more.

-- ------------------------------------------------------------------ Relax the constraint
-- V3 declared UNIQUE (exam_code, name) inline, so Postgres named it
-- exam_stages_exam_code_name_key. Dropped IF EXISTS because a database that was ever
-- hand-repaired may carry a differently-named equivalent, and a hard failure here would
-- block the whole migration for a constraint that is being removed anyway.
ALTER TABLE exam_stages DROP CONSTRAINT IF EXISTS exam_stages_exam_code_name_key;

-- The replacement still forbids the genuine duplicate — the *same* stage name at the
-- *same* version — while allowing two versions of one stage to coexist, which is the
-- entire point of the ticket.
--
-- COALESCE rather than a plain three-column UNIQUE: in Postgres two NULLs are distinct for
-- uniqueness purposes, so `UNIQUE (exam_code, name, version_label)` would happily accept
-- unlimited rows with a NULL version_label — i.e. it would silently drop the duplicate
-- protection that exists today for every un-versioned stage, which is all of them.
-- (`UNIQUE NULLS NOT DISTINCT` would say this more directly but needs PG15+, and pinning a
-- server-version requirement into a migration for cosmetics is not worth it.)
CREATE UNIQUE INDEX uq_exam_stages_exam_name_version
    ON exam_stages (exam_code, name, COALESCE(version_label, ''));

-- ------------------------------------------------------------------ Active resolution
-- Versioning also needs an answer to "which pattern applies *now*", which no column
-- expressed. `effective_from` alone cannot: two versions of a stage both with a past
-- effective_from are both "in effect" by that reading.
--
-- `effective_to` closes the window. NULL = still current, which is the correct default for
-- every existing row: no stage has been superseded until an admin says so. Resolution is
-- then unambiguous and is implemented once, in ExamStructureService — a stage applies on a
-- given date when effective_from is null-or-past AND effective_to is null-or-future.
ALTER TABLE exam_stages ADD COLUMN effective_to DATE;

ALTER TABLE exam_stages
    ADD CONSTRAINT chk_exam_stages_effective_window
    CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to);

-- Supports the resolution predicate above, which runs on every structure read (i.e. every
-- Mock Test tab mount, and every mobile structure sync).
CREATE INDEX idx_exam_stages_effective ON exam_stages (exam_code, effective_from, effective_to);

-- Papers and sections deliberately get no version columns of their own. A paper is
-- meaningless without its stage (V3 makes that cascade explicit), so it inherits the
-- stage's version by composition. Giving papers an independent version would allow a
-- 2018 paper under a 2022 stage — a state with no real-world meaning that every reader
-- would then have to defend against.
