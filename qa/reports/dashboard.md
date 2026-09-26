# QA Dashboard

**GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/qa/generate-reports.js`. Every number below is computed directly from qa/*.yaml at generation time — nothing here is hardcoded or estimated.

_Generated at: 2026-09-25T18:28:17.213Z_

## Coverage

| Module | Requirements | Scenarios | Test Cases | Avg TC/Requirement |
|---|---|---|---|---|
| AI | 24 | 52 | 55 | 2.3 |
| ANALYTICS | 5 | 6 | 6 | 1.2 |
| AUTH | 18 | 30 | 40 | 2.2 |
| CATALOG | 26 | 46 | 56 | 2.2 |
| DAILYPLAN | 15 | 33 | 34 | 2.3 |
| LEARNING-STATE | 5 | 8 | 8 | 1.6 |
| MOCK | 5 | 8 | 10 | 2.0 |
| ONBOARDING | 15 | 28 | 31 | 2.1 |
| PRACTICE | 8 | 13 | 13 | 1.6 |
| QUESTIONS | 28 | 60 | 64 | 2.3 |
| REVISION | 5 | 10 | 10 | 2.0 |
| ROADMAP | 6 | 14 | 15 | 2.5 |
| USER-PROGRESS | 6 | 8 | 8 | 1.3 |
| WEB | 14 | 22 | 23 | 1.6 |
| **Total** | **180** | **338** | **373** | **2.1** |

## Execution status

122 real execution record(s) across 112 test case(s). A test case with no execution record stays `Not Executed`; where a case has been run more than once, the most recent record wins.

| Module | Not Executed | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| AI | 55 | 0 | 0 | 0 | 0 |
| ANALYTICS | 1 | 5 | 0 | 0 | 0 |
| AUTH | 30 | 7 | 0 | 3 | 0 |
| CATALOG | 51 | 3 | 0 | 2 | 0 |
| DAILYPLAN | 3 | 28 | 0 | 3 | 0 |
| LEARNING-STATE | 0 | 8 | 0 | 0 | 0 |
| MOCK | 7 | 3 | 0 | 0 | 0 |
| ONBOARDING | 22 | 8 | 0 | 1 | 0 |
| PRACTICE | 2 | 7 | 0 | 3 | 1 |
| QUESTIONS | 64 | 0 | 0 | 0 | 0 |
| REVISION | 0 | 10 | 0 | 0 | 0 |
| ROADMAP | 0 | 15 | 0 | 0 | 0 |
| USER-PROGRESS | 3 | 5 | 0 | 0 | 0 |
| WEB | 23 | 0 | 0 | 0 | 0 |

## Automation mapping

Evidence-based per qa/README.md's rule — Automated only where a specific test method is cited and verified to cover the exact test case.

| Module | Automated | PartiallyAutomated | CandidateForAutomation | ManualOnly | NotSuitable |
|---|---|---|---|---|---|
| AI | 47 | 0 | 0 | 8 | 0 |
| ANALYTICS | 5 | 1 | 0 | 0 | 0 |
| AUTH | 19 | 6 | 3 | 12 | 0 |
| CATALOG | 20 | 4 | 19 | 13 | 0 |
| DAILYPLAN | 20 | 0 | 0 | 14 | 0 |
| LEARNING-STATE | 8 | 0 | 0 | 0 | 0 |
| MOCK | 3 | 0 | 0 | 7 | 0 |
| ONBOARDING | 4 | 11 | 0 | 16 | 0 |
| PRACTICE | 0 | 0 | 0 | 13 | 0 |
| QUESTIONS | 25 | 3 | 32 | 3 | 1 |
| REVISION | 10 | 0 | 0 | 0 | 0 |
| ROADMAP | 13 | 0 | 0 | 2 | 0 |
| USER-PROGRESS | 4 | 0 | 0 | 4 | 0 |
| WEB | 3 | 0 | 1 | 19 | 0 |
| **Total** | **181** | **25** | **55** | **111** | **1** |

Automated: 49% of all test cases.

## Priority breakdown (all modules)

| Priority | Count |
|---|---|
| Critical | 83 |
| High | 163 |
| Medium | 109 |
| Low | 18 |

## Ambiguous / blocked test cases

Test cases with no determinate expected outcome — established behavior, not a pre-judged pass/fail. See qa/requirements/_conflicts.md for the underlying requirement-level ambiguities.

| Module | Test Case | Title |
|---|---|---|
| CATALOG | TC-CATALOG-007 | Category field accepts any string with no server-side enum enforcement |
| CATALOG | TC-CATALOG-042 | Deleting an exam that still has stages/structure — behavior undetermined |
| CATALOG | TC-CATALOG-047 | An exam's badge/difficulty code that no longer resolves — client fallback undetermined |
| QUESTIONS | TC-QUESTIONS-019 | Deleting an already-soft-deleted question — idempotency undetermined |
| QUESTIONS | TC-QUESTIONS-021 | Empty ids array on bulk-delete — behavior undetermined |
| QUESTIONS | TC-QUESTIONS-036 | Malformed/unrecognized supportedTypes code — behavior undetermined |
| QUESTIONS | TC-QUESTIONS-046 | A REVIEWER-role token also succeeds on content-status change |

## Defects

8 defects logged across all modules.

## Suites

| Suite | Test Cases |
|---|---|
| Critical Business Flow | 9 |
| Regression — AI | 55 |
| Regression — ANALYTICS | 6 |
| Regression — AUTH | 29 |
| Regression — CATALOG | 55 |
| Regression — DAILYPLAN | 31 |
| Regression (Full) | 339 |
| Regression — LEARNING-STATE | 8 |
| Regression — ONBOARDING | 25 |
| Regression — PRACTICE | 10 |
| Regression — QUESTIONS | 64 |
| Regression — REVISION | 10 |
| Regression — ROADMAP | 15 |
| Regression — USER-PROGRESS | 8 |
| Regression — WEB | 23 |
| Release Gate | 217 |
| Sanity | 80 |
| Smoke | 14 |

