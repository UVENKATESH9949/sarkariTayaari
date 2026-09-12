# Execution records — how this folder works

**Nothing in this folder is real yet.** No test case in `qa/test-cases/` has actually been
run in this environment. This README exists to document the convention *before* the first
real execution happens, not to pre-populate fake data.

## The rule

An execution record is **append-only** and lives in a file named `<date>-<module>.yaml`
(e.g. `2026-09-15-auth.yaml`). A new execution — even a re-run of a test case already
executed once — always goes into a **new** file (or a new entry in that day's file), never
edited into a prior execution's record. The test case's own definition
(`qa/test-cases/<module>.yaml`) is never touched by running it.

## Schema

```yaml
- execution_id: EXEC-<MODULE>-NNNN
  test_case_id: TC-<MODULE>-NNN
  test_case_version: 1              # matches the version on the test case at execution time
  environment: "<real environment, e.g. Backend dev, Android emulator-5554, Admin localhost:5173>"
  build_version: "<real git short sha or app version actually under test>"
  tester: "<real name or email of whoever ran it>"
  executed_at: "<real ISO-8601 timestamp>"
  actual_result: "<what was actually observed, in enough detail to reproduce the judgment>"
  status: Pass|Fail|Blocked|Skipped
  defect_id: "<DEF-MODULE-NNN, or empty>"
  evidence: "<a path, screenshot reference, or log excerpt — optional>"
  remarks: "<anything else worth recording>"
```

## Rules that apply to every real execution

- **Never invent a result.** If a test case hasn't actually been run, it stays
  `status: Not Executed` on the test case itself — do not backfill an execution record to
  make coverage look more complete than it is.
- **Ambiguous-status test cases** (see `qa/requirements/_conflicts.md`) get executed like
  any other — record `actual_result` honestly. There is no "expected" to compare against by
  design; the point of running them is to establish what the system actually does, for a
  product/engineering decision.
- **A failed execution becomes a defect** (`qa/defects/<module>.yaml`) only after someone
  judges it's a genuine product defect, not an environment issue or a documented deviation
  already accounted for in the linked requirement.
- After adding real execution files here, regenerate `qa/traceability/RTM.md` and
  `qa/reports/dashboard.md` via `node scripts/qa/generate-reports.js` — both are generated,
  never hand-edited.
