# QA Dashboard

**GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/qa/generate-reports.js`. Every number below is computed directly from qa/*.yaml at generation time — nothing here is hardcoded or estimated.

_Generated at: 2026-09-21T10:26:01.834Z_

## Coverage

| Module | Requirements | Scenarios | Test Cases | Avg TC/Requirement |
|---|---|---|---|---|
| AI | 24 | 52 | 55 | 2.3 |
| ANALYTICS | 5 | 6 | 6 | 1.2 |
| AUTH | 15 | 26 | 29 | 1.9 |
| CATALOG | 25 | 45 | 55 | 2.2 |
| DAILYPLAN | 9 | 23 | 23 | 2.6 |
| LEARNING-STATE | 5 | 8 | 8 | 1.6 |
| ONBOARDING | 13 | 25 | 25 | 1.9 |
| QUESTIONS | 28 | 60 | 64 | 2.3 |
| REVISION | 5 | 10 | 10 | 2.0 |
| ROADMAP | 6 | 14 | 15 | 2.5 |
| USER-PROGRESS | 6 | 8 | 8 | 1.3 |
| WEB | 14 | 22 | 23 | 1.6 |
| **Total** | **155** | **299** | **321** | **2.1** |

## Execution status

79 real execution record(s) across 74 test case(s). A test case with no execution record stays `Not Executed`; where a case has been run more than once, the most recent record wins.

| Module | Not Executed | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| AI | 55 | 0 | 0 | 0 | 0 |
| ANALYTICS | 1 | 5 | 0 | 0 | 0 |
| AUTH | 26 | 3 | 0 | 0 | 0 |
| CATALOG | 52 | 3 | 0 | 0 | 0 |
| DAILYPLAN | 1 | 21 | 0 | 1 | 0 |
| LEARNING-STATE | 0 | 8 | 0 | 0 | 0 |
| ONBOARDING | 22 | 3 | 0 | 0 | 0 |
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
| AUTH | 14 | 5 | 3 | 7 | 0 |
| CATALOG | 20 | 4 | 19 | 12 | 0 |
| DAILYPLAN | 13 | 0 | 0 | 10 | 0 |
| LEARNING-STATE | 8 | 0 | 0 | 0 | 0 |
| ONBOARDING | 3 | 11 | 0 | 11 | 0 |
| QUESTIONS | 25 | 3 | 32 | 3 | 1 |
| REVISION | 10 | 0 | 0 | 0 | 0 |
| ROADMAP | 13 | 0 | 0 | 2 | 0 |
| USER-PROGRESS | 4 | 0 | 0 | 4 | 0 |
| WEB | 3 | 0 | 1 | 19 | 0 |
| **Total** | **165** | **24** | **55** | **76** | **1** |

Automated: 51% of all test cases.

## Priority breakdown (all modules)

| Priority | Count |
|---|---|
| Critical | 70 |
| High | 136 |
| Medium | 99 |
| Low | 16 |

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

3 defects logged across all modules.

## Suites

| Suite | Test Cases |
|---|---|
| Critical Business Flow | 9 |
| Regression — AI | 55 |
| Regression — ANALYTICS | 6 |
| Regression — AUTH | 29 |
| Regression — CATALOG | 55 |
| Regression — DAILYPLAN | 23 |
| Regression (Full) | 321 |
| Regression — LEARNING-STATE | 8 |
| Regression — ONBOARDING | 25 |
| Regression — QUESTIONS | 64 |
| Regression — REVISION | 10 |
| Regression — ROADMAP | 15 |
| Regression — USER-PROGRESS | 8 |
| Regression — WEB | 23 |
| Release Gate | 203 |
| Sanity | 70 |
| Smoke | 14 |

