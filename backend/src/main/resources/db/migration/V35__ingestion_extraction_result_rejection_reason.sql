-- TASK-2401 Task 8. Document 12's own API sketch says "Reject, with a required reason,"
-- but Document 9's original column list for ingestion_extraction_results had no place to
-- put one -- a real gap between this task's own two design documents, found while
-- actually implementing the review endpoint rather than left unnoticed. Not overloaded
-- into validation_warnings (a system-computed field, not a human-entered one) -- a small,
-- additive, purpose-built column instead, matching this table's own existing convention
-- of one column per distinct concept.

ALTER TABLE ingestion_extraction_results ADD COLUMN rejection_reason TEXT;
