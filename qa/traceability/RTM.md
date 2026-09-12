# Requirement Traceability Matrix (RTM)

**GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/qa/generate-reports.js` after any change to qa/requirements, qa/scenarios, or qa/test-cases.

Shows Requirement -> Scenario -> Test Case -> Execution -> Defect for every requirement across AUTH, CATALOG, and QUESTIONS. Execution and Defect columns are empty everywhere right now because no real test execution has occurred yet — this reflects the actual current state, not a placeholder to be filled in by hand.

## AI

17 requirements, 34 scenarios, 34 test cases.

| Requirement | Priority | Status | Scenario(s) | Test Case(s) | Execution | Defect |
|---|---|---|---|---|---|---|
| REQ-AI-001: AI task registry | Critical | Active | SCN-AI-001<br>SCN-AI-002<br>SCN-AI-003 | TC-AI-001 (Not Executed)<br>TC-AI-002 (Not Executed)<br>TC-AI-003 (Not Executed) | |  |
| REQ-AI-002: Language scoping for AI answers | Critical | Active | SCN-AI-004<br>SCN-AI-005 | TC-AI-004 (Not Executed)<br>TC-AI-005 (Not Executed) | |  |
| REQ-AI-003: Context minimisation | Critical | Active | SCN-AI-003<br>SCN-AI-006<br>SCN-AI-007<br>SCN-AI-008 | TC-AI-003 (Not Executed)<br>TC-AI-006 (Not Executed)<br>TC-AI-007 (Not Executed)<br>TC-AI-008 (Not Executed) | |  |
| REQ-AI-004: Answer grounding | Critical | Active | SCN-AI-009<br>SCN-AI-010<br>SCN-AI-011 | TC-AI-009 (Not Executed)<br>TC-AI-010 (Not Executed)<br>TC-AI-011 (Not Executed) | |  |
| REQ-AI-005: Structured output validation | Critical | Active | SCN-AI-012<br>SCN-AI-013<br>SCN-AI-014 | TC-AI-012 (Not Executed)<br>TC-AI-013 (Not Executed)<br>TC-AI-014 (Not Executed) | |  |
| REQ-AI-006: Tier routing order | Critical | Active | SCN-AI-008<br>SCN-AI-015<br>SCN-AI-016<br>SCN-AI-017<br>SCN-AI-022 | TC-AI-008 (Not Executed)<br>TC-AI-015 (Not Executed)<br>TC-AI-016 (Not Executed)<br>TC-AI-017 (Not Executed)<br>TC-AI-022 (Not Executed) | |  |
| REQ-AI-007: Graceful degradation | Critical | Active | SCN-AI-018<br>SCN-AI-019 | TC-AI-018 (Not Executed)<br>TC-AI-019 (Not Executed) | |  |
| REQ-AI-008: Per-task feature flags default off | High | Active | SCN-AI-020 | TC-AI-020 (Not Executed) | |  |
| REQ-AI-009: Device-tier gating for the local model | High | Active | SCN-AI-021<br>SCN-AI-022 | TC-AI-021 (Not Executed)<br>TC-AI-022 (Not Executed) | |  |
| REQ-AI-010: Batch generation is explicitly scoped, never open-ended | Critical | Active | SCN-AI-023<br>SCN-AI-024<br>SCN-AI-025<br>SCN-AI-026 | TC-AI-023 (Not Executed)<br>TC-AI-024 (Not Executed)<br>TC-AI-025 (Not Executed)<br>TC-AI-026 (Not Executed) | |  |
| REQ-AI-011: Generated content is grounded against the verified answer before it is ever persisted | Critical | Active | SCN-AI-027 | TC-AI-027 (Not Executed) | |  |
| REQ-AI-012: Human review workflow — DRAFT to REVIEW to PUBLISHED | Critical | Active | SCN-AI-028<br>SCN-AI-029 | TC-AI-028 (Not Executed)<br>TC-AI-029 (Not Executed) | |  |
| REQ-AI-013: Optimistic concurrency on every review transition | High | Active | SCN-AI-030 | TC-AI-030 (Not Executed) | |  |
| REQ-AI-014: The review queue is filterable by task and status | Medium | Active | SCN-AI-031 | TC-AI-031 (Not Executed) | |  |
| REQ-AI-015: Public sync feed withholds unpublished content | Critical | Active | SCN-AI-032 | TC-AI-032 (Not Executed) | |  |
| REQ-AI-016: Public client-config feed reports every AI task's enable state | Critical | Active | SCN-AI-033 | TC-AI-033 (Not Executed) | |  |
| REQ-AI-017: Admin per-task AI enable/disable control | High | Active | SCN-AI-034 | TC-AI-034 (Not Executed) | |  |

## AUTH

14 requirements, 23 scenarios, 26 test cases.

| Requirement | Priority | Status | Scenario(s) | Test Case(s) | Execution | Defect |
|---|---|---|---|---|---|---|
| REQ-AUTH-001: Student self-registration | Critical | Active | SCN-AUTH-001<br>SCN-AUTH-002<br>SCN-AUTH-003 | TC-AUTH-001 (Not Executed)<br>TC-AUTH-002 (Not Executed)<br>TC-AUTH-003 (Not Executed)<br>TC-AUTH-004 (Not Executed) | |  |
| REQ-AUTH-002: Login (student and admin) | Critical | Active | SCN-AUTH-004<br>SCN-AUTH-005<br>SCN-AUTH-006 | TC-AUTH-005 (Not Executed)<br>TC-AUTH-006 (Not Executed)<br>TC-AUTH-007 (Not Executed)<br>TC-AUTH-008 (Not Executed) | |  |
| REQ-AUTH-003: Logout / single-device session revocation | High | Active | SCN-AUTH-007<br>SCN-AUTH-008 | TC-AUTH-009 (Not Executed)<br>TC-AUTH-010 (Not Executed) | |  |
| REQ-AUTH-004: Session validation / profile fetch on launch | Critical | Active | SCN-AUTH-009<br>SCN-AUTH-010<br>SCN-AUTH-011 | TC-AUTH-011 (Not Executed)<br>TC-AUTH-012 (Not Executed)<br>TC-AUTH-013 (Not Executed)<br>TC-AUTH-014 (Not Executed) | |  |
| REQ-AUTH-005: Opaque bearer token mechanism | Critical | Active | SCN-AUTH-011<br>SCN-AUTH-012 | TC-AUTH-014 (Not Executed)<br>TC-AUTH-015 (Not Executed) | |  |
| REQ-AUTH-006: Multiple concurrent device sessions per account | Medium | Active | SCN-AUTH-008 | TC-AUTH-010 (Not Executed) | |  |
| REQ-AUTH-007: requireUser — any-signed-in-role authorization primitive | Critical | Active | SCN-AUTH-013 | TC-AUTH-016 (Not Executed) | |  |
| REQ-AUTH-008: requireAdmin — admin-only authorization primitive, 401 vs 403 distinction | Critical | Active | SCN-AUTH-014<br>SCN-AUTH-015 | TC-AUTH-017 (Not Executed)<br>TC-AUTH-018 (Not Executed) | |  |
| REQ-AUTH-009: Public content-sync endpoints require no auth | Critical | Active | SCN-AUTH-016 | TC-AUTH-019 (Not Executed) | |  |
| REQ-AUTH-010: First admin creation via server-side bootstrap only | Critical | Active | SCN-AUTH-017<br>SCN-AUTH-018 | TC-AUTH-020 (Not Executed)<br>TC-AUTH-021 (Not Executed) | |  |
| REQ-AUTH-011: Admin-invites-admin (no token leak to the creator) | High | Active | SCN-AUTH-019<br>SCN-AUTH-020 | TC-AUTH-022 (Not Executed)<br>TC-AUTH-023 (Not Executed) | |  |
| REQ-AUTH-012: Uniform AUTH error contract | High | Active | SCN-AUTH-021 | TC-AUTH-024 (Not Executed) | |  |
| REQ-AUTH-013: Login/register timing must not leak account existence | Medium | Active | SCN-AUTH-022 | TC-AUTH-025 (Not Executed) | |  |
| REQ-AUTH-014: Accounts are optional — full app usability while signed out | High | Active | SCN-AUTH-023 | TC-AUTH-026 (Not Executed) | |  |

## CATALOG

24 requirements, 43 scenarios, 52 test cases.

| Requirement | Priority | Status | Scenario(s) | Test Case(s) | Execution | Defect |
|---|---|---|---|---|---|---|
| REQ-CATALOG-001: Exam entity CRUD, code as immutable identity, active-only public read | Critical | Active | SCN-CATALOG-001<br>SCN-CATALOG-002<br>SCN-CATALOG-003<br>SCN-CATALOG-033 | TC-CATALOG-001 (Not Executed)<br>TC-CATALOG-002 (Not Executed)<br>TC-CATALOG-003 (Not Executed)<br>TC-CATALOG-004 (Not Executed)<br>TC-CATALOG-042 (Not Executed) | |  |
| REQ-CATALOG-002: Exam optional difficulty/badge FK validation and null normalization | High | Active | SCN-CATALOG-004 | TC-CATALOG-005 (Not Executed)<br>TC-CATALOG-006 (Not Executed) | |  |
| REQ-CATALOG-003: Exam category facet (free string, not DB-enforced) | Low | Active | SCN-CATALOG-005 | TC-CATALOG-007 (Not Executed) | |  |
| REQ-CATALOG-004: Exam Discovery listing: pagination, sort, status/category filter, computed fields | High | Active | SCN-CATALOG-006<br>SCN-CATALOG-007<br>SCN-CATALOG-008 | TC-CATALOG-008 (Not Executed)<br>TC-CATALOG-009 (Not Executed)<br>TC-CATALOG-010 (Not Executed) | |  |
| REQ-CATALOG-005: Exam syllabus (exam_subjects): get/replace, admin-only | High | Active | SCN-CATALOG-009<br>SCN-CATALOG-010 | TC-CATALOG-011 (Not Executed)<br>TC-CATALOG-012 (Not Executed)<br>TC-CATALOG-013 (Not Executed) | |  |
| REQ-CATALOG-006: Exam topic map / curated weightage (exam_topics): get/replace, admin-only | Medium | Active | SCN-CATALOG-011<br>SCN-CATALOG-012 | TC-CATALOG-014 (Not Executed)<br>TC-CATALOG-015 (Not Executed)<br>TC-CATALOG-016 (Not Executed) | |  |
| REQ-CATALOG-007: Subject CRUD (global, shared across exams) | Critical | Active | SCN-CATALOG-013<br>SCN-CATALOG-014 | TC-CATALOG-017 (Not Executed)<br>TC-CATALOG-018 (Not Executed) | |  |
| REQ-CATALOG-008: Topic CRUD, per-subject scoping, and parent hierarchy with cycle prevention | Critical | Active | SCN-CATALOG-015<br>SCN-CATALOG-016 | TC-CATALOG-019 (Not Executed)<br>TC-CATALOG-020 (Not Executed)<br>TC-CATALOG-021 (Not Executed)<br>TC-CATALOG-022 (Not Executed)<br>TC-CATALOG-023 (Not Executed) | |  |
| REQ-CATALOG-009: Topic prerequisites (DAG) with "null = unchanged, empty = clear" semantics | High | Active | SCN-CATALOG-017<br>SCN-CATALOG-018 | TC-CATALOG-024 (Not Executed)<br>TC-CATALOG-025 (Not Executed)<br>TC-CATALOG-026 (Not Executed) | |  |
| REQ-CATALOG-010: Language CRUD (active/all split) | High | Active | SCN-CATALOG-019 | TC-CATALOG-027 (Not Executed) | |  |
| REQ-CATALOG-011: Difficulty Level CRUD (active/all split; referenced by questions) | Critical | Active | SCN-CATALOG-020<br>SCN-CATALOG-021 | TC-CATALOG-028 (Not Executed)<br>TC-CATALOG-029 (Not Executed) | |  |
| REQ-CATALOG-012: Paper Type CRUD (no active/inactive split; mockable flag) | Medium | Active | SCN-CATALOG-022 | TC-CATALOG-030 (Not Executed) | |  |
| REQ-CATALOG-013: Exam Stage CRUD with pattern versioning | High | Active | SCN-CATALOG-023<br>SCN-CATALOG-024<br>SCN-CATALOG-025 | TC-CATALOG-031 (Not Executed)<br>TC-CATALOG-032 (Not Executed)<br>TC-CATALOG-033 (Not Executed)<br>TC-CATALOG-034 (Not Executed) | |  |
| REQ-CATALOG-014: Exam Paper CRUD under a stage | High | Active | SCN-CATALOG-026<br>SCN-CATALOG-027 | TC-CATALOG-035 (Not Executed)<br>TC-CATALOG-036 (Not Executed) | |  |
| REQ-CATALOG-015: Paper Section CRUD with marks/timing inheritance | Critical | Active | SCN-CATALOG-028<br>SCN-CATALOG-029<br>SCN-CATALOG-030 | TC-CATALOG-037 (Not Executed)<br>TC-CATALOG-038 (Not Executed)<br>TC-CATALOG-039 (Not Executed) | |  |
| REQ-CATALOG-016: Section save auto-adds subjects to the exam syllabus (one-way sync) | High | Active | SCN-CATALOG-031 | TC-CATALOG-040 (Not Executed) | |  |
| REQ-CATALOG-017: Exam structure cascade-delete semantics (asymmetric) | High | Active | SCN-CATALOG-032<br>SCN-CATALOG-033<br>SCN-CATALOG-042 | TC-CATALOG-041 (Not Executed)<br>TC-CATALOG-042 (Not Executed)<br>TC-CATALOG-052 (Not Executed) | |  |
| REQ-CATALOG-018: Admin structure read returns every pattern version (incl. superseded) | Medium | Active | SCN-CATALOG-034 | TC-CATALOG-043 (Not Executed) | |  |
| REQ-CATALOG-019: Public structure sync read returns only the current/effective version | Critical | Active | SCN-CATALOG-035<br>SCN-CATALOG-036 | TC-CATALOG-044 (Not Executed)<br>TC-CATALOG-045 (Not Executed) | |  |
| REQ-CATALOG-020: Exam Badges: read-only vocabulary, active/all split, no CRUD | Low | Active | SCN-CATALOG-037<br>SCN-CATALOG-043 | TC-CATALOG-046 (Not Executed)<br>TC-CATALOG-047 (Not Executed) | |  |
| REQ-CATALOG-021: Cross-cutting: public-vs-admin auth split across the whole catalog | Critical | Active | SCN-CATALOG-003<br>SCN-CATALOG-038 | TC-CATALOG-048 (Not Executed) | |  |
| REQ-CATALOG-022: Mobile — entire catalog syncs for full offline browsing and mock-test generation | Critical | Active | SCN-CATALOG-039 | TC-CATALOG-049 (Not Executed) | |  |
| REQ-CATALOG-023: Known limitation: per-section timers not enforced during a live mock test | Medium | Active | SCN-CATALOG-040 | TC-CATALOG-050 (Not Executed) | |  |
| REQ-CATALOG-024: Admin nested structure editor — inherited-value display and cascade-delete confirmation | Medium | Active | SCN-CATALOG-041<br>SCN-CATALOG-042 | TC-CATALOG-051 (Not Executed)<br>TC-CATALOG-052 (Not Executed) | |  |

## QUESTIONS

28 requirements, 60 scenarios, 64 test cases.

| Requirement | Priority | Status | Scenario(s) | Test Case(s) | Execution | Defect |
|---|---|---|---|---|---|---|
| REQ-QUESTIONS-001: Create a question (admin authoring) | Critical | Active | SCN-QUESTIONS-001<br>SCN-QUESTIONS-002<br>SCN-QUESTIONS-003 | TC-QUESTIONS-001 (Not Executed)<br>TC-QUESTIONS-002 (Not Executed)<br>TC-QUESTIONS-003 (Not Executed) | |  |
| REQ-QUESTIONS-002: Multi-type answerKey/contentStructure validation per questionType | High | Active | SCN-QUESTIONS-004<br>SCN-QUESTIONS-005<br>SCN-QUESTIONS-006<br>SCN-QUESTIONS-007<br>SCN-QUESTIONS-008<br>SCN-QUESTIONS-009 | TC-QUESTIONS-004 (Not Executed)<br>TC-QUESTIONS-005 (Not Executed)<br>TC-QUESTIONS-006 (Not Executed)<br>TC-QUESTIONS-007 (Not Executed)<br>TC-QUESTIONS-008 (Not Executed)<br>TC-QUESTIONS-009 (Not Executed)<br>TC-QUESTIONS-010 (Not Executed) | |  |
| REQ-QUESTIONS-003: Bilingual/multi-language translation management | Critical | Active | SCN-QUESTIONS-010<br>SCN-QUESTIONS-011 | TC-QUESTIONS-011 (Not Executed)<br>TC-QUESTIONS-012 (Not Executed)<br>TC-QUESTIONS-013 (Not Executed) | |  |
| REQ-QUESTIONS-004: PYQ provenance fields auto-clear when pyq=false | Medium | Active | SCN-QUESTIONS-012 | TC-QUESTIONS-014 (Not Executed) | |  |
| REQ-QUESTIONS-005: Update question metadata (PUT) | Critical | Active | SCN-QUESTIONS-013 | TC-QUESTIONS-015 (Not Executed) | |  |
| REQ-QUESTIONS-006: Read a single question (admin) | High | Active | SCN-QUESTIONS-014 | TC-QUESTIONS-016 (Not Executed) | |  |
| REQ-QUESTIONS-007: Paginated/filterable question list (admin) | High | Active | SCN-QUESTIONS-015 | TC-QUESTIONS-017 (Not Executed) | |  |
| REQ-QUESTIONS-008: Soft-delete a single question (tombstone) | Critical | Active | SCN-QUESTIONS-016<br>SCN-QUESTIONS-017 | TC-QUESTIONS-018 (Not Executed)<br>TC-QUESTIONS-019 (Not Executed) | |  |
| REQ-QUESTIONS-009: Bulk soft-delete many questions | High | Active | SCN-QUESTIONS-018<br>SCN-QUESTIONS-019 | TC-QUESTIONS-020 (Not Executed)<br>TC-QUESTIONS-021 (Not Executed) | |  |
| REQ-QUESTIONS-010: Bulk import questions | Critical | Active | SCN-QUESTIONS-020<br>SCN-QUESTIONS-021<br>SCN-QUESTIONS-022<br>SCN-QUESTIONS-023 | TC-QUESTIONS-022 (Not Executed)<br>TC-QUESTIONS-023 (Not Executed)<br>TC-QUESTIONS-024 (Not Executed)<br>TC-QUESTIONS-025 (Not Executed) | |  |
| REQ-QUESTIONS-011: Bulk import duplicate detection (within-batch and against bank) | Medium | Active | SCN-QUESTIONS-024 | TC-QUESTIONS-026 (Not Executed) | |  |
| REQ-QUESTIONS-012: Content-sync endpoint — delta/full sync with pagination | Critical | Active | SCN-QUESTIONS-025<br>SCN-QUESTIONS-026<br>SCN-QUESTIONS-027<br>SCN-QUESTIONS-028 | TC-QUESTIONS-027 (Not Executed)<br>TC-QUESTIONS-028 (Not Executed)<br>TC-QUESTIONS-029 (Not Executed)<br>TC-QUESTIONS-030 (Not Executed) | |  |
| REQ-QUESTIONS-013: Soft-deleted questions sync as full-content tombstones | Critical | Active | SCN-QUESTIONS-029<br>SCN-QUESTIONS-031 | TC-QUESTIONS-031 (Not Executed)<br>TC-QUESTIONS-033 (Not Executed) | |  |
| REQ-QUESTIONS-014: Content-status gating on public reads (PUBLISHED-only for live rows) | High | Active | SCN-QUESTIONS-030<br>SCN-QUESTIONS-031<br>SCN-QUESTIONS-044 | TC-QUESTIONS-032 (Not Executed)<br>TC-QUESTIONS-033 (Not Executed)<br>TC-QUESTIONS-047 (Not Executed) | |  |
| REQ-QUESTIONS-015: Sync/live capability negotiation (supportedTypes) | Medium | Active | SCN-QUESTIONS-032<br>SCN-QUESTIONS-033<br>SCN-QUESTIONS-034 | TC-QUESTIONS-034 (Not Executed)<br>TC-QUESTIONS-035 (Not Executed)<br>TC-QUESTIONS-036 (Not Executed) | |  |
| REQ-QUESTIONS-016: Live filterable browsing endpoint (/live) | High | Active | SCN-QUESTIONS-035<br>SCN-QUESTIONS-036 | TC-QUESTIONS-037 (Not Executed)<br>TC-QUESTIONS-038 (Not Executed) | |  |
| REQ-QUESTIONS-017: Grouped question counts endpoint (/counts) | Medium | Active | SCN-QUESTIONS-037<br>SCN-QUESTIONS-038 | TC-QUESTIONS-039 (Not Executed)<br>TC-QUESTIONS-040 (Not Executed)<br>TC-QUESTIONS-041 (Not Executed) | |  |
| REQ-QUESTIONS-018: Live Mock Test assembly (/mock-count, /mock-sample) | High | Active | SCN-QUESTIONS-039<br>SCN-QUESTIONS-040<br>SCN-QUESTIONS-041 | TC-QUESTIONS-042 (Not Executed)<br>TC-QUESTIONS-043 (Not Executed)<br>TC-QUESTIONS-044 (Not Executed) | |  |
| REQ-QUESTIONS-019: One-click content-status change | High | Active | SCN-QUESTIONS-042<br>SCN-QUESTIONS-043<br>SCN-QUESTIONS-044<br>SCN-QUESTIONS-045 | TC-QUESTIONS-045 (Not Executed)<br>TC-QUESTIONS-046 (Not Executed)<br>TC-QUESTIONS-047 (Not Executed)<br>TC-QUESTIONS-048 (Not Executed) | |  |
| REQ-QUESTIONS-020: Image upload for question content | Medium | Active | SCN-QUESTIONS-046<br>SCN-QUESTIONS-047<br>SCN-QUESTIONS-048 | TC-QUESTIONS-049 (Not Executed)<br>TC-QUESTIONS-050 (Not Executed)<br>TC-QUESTIONS-051 (Not Executed) | |  |
| REQ-QUESTIONS-021: Automatic duplicate detection at write time | Medium | Active | SCN-QUESTIONS-049<br>SCN-QUESTIONS-050 | TC-QUESTIONS-052 (Not Executed)<br>TC-QUESTIONS-053 (Not Executed) | |  |
| REQ-QUESTIONS-022: Duplicate review queue (list, count, resolve) | Medium | Active | SCN-QUESTIONS-051<br>SCN-QUESTIONS-052 | TC-QUESTIONS-054 (Not Executed)<br>TC-QUESTIONS-055 (Not Executed)<br>TC-QUESTIONS-056 (Not Executed) | |  |
| REQ-QUESTIONS-023: Duplicate dry-run check (pre-import) | Low | Active | SCN-QUESTIONS-053 | TC-QUESTIONS-057 (Not Executed) | |  |
| REQ-QUESTIONS-024: Duplicate backfill rescan | Low | Active | SCN-QUESTIONS-054 | TC-QUESTIONS-058 (Not Executed) | |  |
| REQ-QUESTIONS-025: Question-type reference data | Low | Active | SCN-QUESTIONS-055 | TC-QUESTIONS-059 (Not Executed) | |  |
| REQ-QUESTIONS-026: Bounded/paginated reads across the Questions module (performance & crash-prevention) | High | Active | SCN-QUESTIONS-028<br>SCN-QUESTIONS-056<br>SCN-QUESTIONS-057 | TC-QUESTIONS-030 (Not Executed)<br>TC-QUESTIONS-060 (Not Executed)<br>TC-QUESTIONS-061 (Not Executed) | |  |
| REQ-QUESTIONS-027: Web Practice engine scores and reveals every question type | Critical | Active | SCN-QUESTIONS-058<br>SCN-QUESTIONS-059 | TC-QUESTIONS-062 (Not Executed)<br>TC-QUESTIONS-063 (Not Executed) | |  |
| REQ-QUESTIONS-028: Question-group (passage/media) content renders in web Practice | Medium | Active | SCN-QUESTIONS-060 | TC-QUESTIONS-064 (Not Executed) | |  |

## USER-PROGRESS

1 requirements, 2 scenarios, 2 test cases.

| Requirement | Priority | Status | Scenario(s) | Test Case(s) | Execution | Defect |
|---|---|---|---|---|---|---|
| REQ-USERPROGRESS-001: Web practice sessions upload via the existing write-once contract | High | Active | SCN-USERPROGRESS-001<br>SCN-USERPROGRESS-002 | TC-USERPROGRESS-001 (Not Executed)<br>TC-USERPROGRESS-002 (Not Executed) | |  |

## WEB

10 requirements, 16 scenarios, 17 test cases.

| Requirement | Priority | Status | Scenario(s) | Test Case(s) | Execution | Defect |
|---|---|---|---|---|---|---|
| REQ-WEB-001: Shared logic has exactly one implementation | Critical | Active | SCN-WEB-001<br>SCN-WEB-002 | TC-WEB-001 (Not Executed)<br>TC-WEB-002 (Not Executed)<br>TC-WEB-004 (Not Executed) | |  |
| REQ-WEB-002: Evaluator agreement between Java and TypeScript | Critical | Active | SCN-WEB-003 | TC-WEB-003 (Not Executed) | |  |
| REQ-WEB-003: Responsive layout from phone browser to desktop | High | Active | SCN-WEB-004<br>SCN-WEB-005 | TC-WEB-005 (Not Executed) | |  |
| REQ-WEB-004: Account and Settings reachable at every width | Critical | Active | SCN-WEB-005 | TC-WEB-006 (Not Executed) | |  |
| REQ-WEB-005: Theme and text size | Medium | Active | SCN-WEB-006<br>SCN-WEB-007 | TC-WEB-007 (Not Executed)<br>TC-WEB-008 (Not Executed) | |  |
| REQ-WEB-006: Interface language | Medium | Active | SCN-WEB-008 | TC-WEB-009 (Not Executed) | |  |
| REQ-WEB-007: Browser session | Critical | Active | SCN-WEB-009<br>SCN-WEB-010 | TC-WEB-010 (Not Executed)<br>TC-WEB-011 (Not Executed) | |  |
| REQ-WEB-008: Cross-origin access to the backend | Critical | Active | SCN-WEB-011<br>SCN-WEB-012 | TC-WEB-012 (Not Executed)<br>TC-WEB-013 (Not Executed) | |  |
| REQ-WEB-010: Mock Test engine — timed, blind, navigable, with an unload guard | Critical | Active | SCN-WEB-014<br>SCN-WEB-015<br>SCN-WEB-016 | TC-WEB-015 (Not Executed)<br>TC-WEB-016 (Not Executed)<br>TC-WEB-017 (Not Executed) | |  |
| REQ-WEB-009: Client-side routing survives a direct hit | High | Active | SCN-WEB-013 | TC-WEB-014 (Not Executed) | |  |

## Summary

| Metric | Value |
|---|---|
| Total requirements | 94 |
| Total scenarios | 178 |
| Total test cases | 195 |
| Requirements with zero scenarios | 0  |
| Real executions recorded | 0 |
| Real defects logged | 0 |
