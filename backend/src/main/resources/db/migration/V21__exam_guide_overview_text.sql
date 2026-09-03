-- Exam Guide spec §1/§4 "What is this exam?" -- a plain-language overview paragraph, the
-- one Q1 field the model had no place to store at all (confirmed by reading
-- RecruitmentCycle.java directly before writing this). Nullable and purely additive: an
-- existing cycle with no overview set renders nothing on the Guide screen, same
-- graceful-degradation convention every other optional field on this table already follows.
ALTER TABLE recruitment_cycles
    ADD COLUMN overview_text TEXT;
