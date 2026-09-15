# QA Dashboard

**GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/qa/generate-reports.js`. Every number below is computed directly from qa/*.yaml at generation time — nothing here is hardcoded or estimated.

_Generated at: 2026-09-15T11:50:11.617Z_

## Coverage

| Module | Requirements | Scenarios | Test Cases | Avg TC/Requirement |
|---|---|---|---|---|
| AI | 23 | 50 | 52 | 2.3 |
| AUTH | 14 | 23 | 26 | 1.9 |
| CATALOG | 24 | 43 | 52 | 2.2 |
| QUESTIONS | 28 | 60 | 64 | 2.3 |
| USER-PROGRESS | 1 | 2 | 2 | 2.0 |
| WEB | 10 | 17 | 18 | 1.8 |
| **Total** | **100** | **195** | **214** | **2.1** |

## Execution status

No real execution has occurred yet in this environment — every test case is currently `Not Executed`. This section will populate automatically once qa/execution/*.yaml files contain real execution records.

| Module | Not Executed | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| AI | 52 | 0 | 0 | 0 | 0 |
| AUTH | 26 | 0 | 0 | 0 | 0 |
| CATALOG | 52 | 0 | 0 | 0 | 0 |
| QUESTIONS | 64 | 0 | 0 | 0 | 0 |
| USER-PROGRESS | 2 | 0 | 0 | 0 | 0 |
| WEB | 18 | 0 | 0 | 0 | 0 |

## Automation mapping

Evidence-based per qa/README.md's rule — Automated only where a specific test method is cited and verified to cover the exact test case.

| Module | Automated | PartiallyAutomated | CandidateForAutomation | ManualOnly | NotSuitable |
|---|---|---|---|---|---|
| AI | 47 | 0 | 0 | 5 | 0 |
| AUTH | 14 | 5 | 3 | 4 | 0 |
| CATALOG | 20 | 4 | 19 | 9 | 0 |
| QUESTIONS | 25 | 3 | 32 | 3 | 1 |
| USER-PROGRESS | 0 | 0 | 0 | 2 | 0 |
| WEB | 3 | 0 | 1 | 14 | 0 |
| **Total** | **109** | **12** | **55** | **37** | **1** |

Automated: 51% of all test cases.

## Priority breakdown (all modules)

| Priority | Count |
|---|---|
| Critical | 55 |
| High | 78 |
| Medium | 70 |
| Low | 11 |

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

No defects logged yet — none have been fabricated ahead of real execution, per qa/README.md's rule.

## Suites

| Suite | Test Cases |
|---|---|
| Critical Business Flow | 9 |
| Regression — AI | 52 |
| Regression — AUTH | 26 |
| Regression — CATALOG | 52 |
| Regression (Full) | 214 |
| Regression — QUESTIONS | 64 |
| Regression — USER-PROGRESS | 2 |
| Regression — WEB | 18 |
| Release Gate | 130 |
| Sanity | 55 |
| Smoke | 14 |

