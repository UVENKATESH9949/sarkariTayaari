// Generates qa/traceability/RTM.md and qa/reports/dashboard.md from the structured qa/*.yaml
// data. Both are GENERATED — never hand-edit them; edit the source YAML and regenerate.
// Numbers here come only from real files that exist (requirements/scenarios/test-cases/
// defects/executions); nothing is hardcoded.
//
// Run: node scripts/qa/generate-reports.js

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "..", "..");
// Derived from qa/requirements/ rather than hardcoded: this list was a literal in three separate
// scripts, so adding a module silently produced no RTM, dashboard or suite coverage until
// someone found and edited all three. Discovered when the WEB module was added (TASK-2601).
const MODULES = fs
  .readdirSync(path.join(ROOT, "qa", "requirements"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => f.replace(/\.yaml$/, ""))
  .sort();

function load(rel) {
  return yaml.load(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

const data = {};
for (const m of MODULES) {
  data[m] = {
    requirements: load(`qa/requirements/${m}.yaml`),
    scenarios: load(`qa/scenarios/${m}.yaml`),
    testCases: load(`qa/test-cases/${m}.yaml`),
    defects: load(`qa/defects/${m}.yaml`),
  };
}

// executions: any file under qa/execution/*.yaml (none exist yet as real data)
let executions = [];
const execDir = path.join(ROOT, "qa", "execution");
if (fs.existsSync(execDir)) {
  for (const f of fs.readdirSync(execDir)) {
    if (f.endsWith(".yaml")) {
      const recs = yaml.load(fs.readFileSync(path.join(execDir, f), "utf8")) || [];
      executions = executions.concat(recs.map(r => ({ ...r, _file: f })));
    }
  }
}

// ---------- RTM ----------
let rtm = `# Requirement Traceability Matrix (RTM)\n\n`;
rtm += `**GENERATED FILE — do not hand-edit.** Regenerate with \`node scripts/qa/generate-reports.js\` after any change to qa/requirements, qa/scenarios, or qa/test-cases.\n\n`;
rtm += `Shows Requirement -> Scenario -> Test Case -> Execution -> Defect for every requirement across AUTH, CATALOG, and QUESTIONS. Execution and Defect columns are empty everywhere right now because no real test execution has occurred yet — this reflects the actual current state, not a placeholder to be filled in by hand.\n\n`;

let totalReq = 0, totalScn = 0, totalTc = 0, uncoveredReq = [];
for (const m of MODULES) {
  const { requirements, scenarios, testCases } = data[m];
  totalReq += requirements.length;
  totalScn += scenarios.length;
  totalTc += testCases.length;

  rtm += `## ${m.toUpperCase()}\n\n`;
  rtm += `${requirements.length} requirements, ${scenarios.length} scenarios, ${testCases.length} test cases.\n\n`;
  rtm += `| Requirement | Priority | Status | Scenario(s) | Test Case(s) | Execution | Defect |\n`;
  rtm += `|---|---|---|---|---|---|---|\n`;

  for (const req of requirements) {
    const scns = scenarios.filter(s => s.requirement_ids.includes(req.id));
    const tcs = testCases.filter(t => t.requirement_ids.includes(req.id));
    if (scns.length === 0) uncoveredReq.push(req.id);

    const scnCell = scns.map(s => s.id).join("<br>") || "_none_";
    const tcCell = tcs.map(t => {
      const execs = executions.filter(e => e.test_case_id === t.id);
      const lastStatus = execs.length ? execs[execs.length - 1].status : t.status;
      return `${t.id} (${lastStatus})`;
    }).join("<br>") || "_none_";
    const defectCell = tcs.flatMap(t => data[m].defects.filter(d => d.test_case_id === t.id).map(d => d.id)).join("<br>") || "";

    rtm += `| ${req.id}: ${req.feature} | ${req.priority} | ${req.status} | ${scnCell} | ${tcCell} | | ${defectCell} |\n`;
  }
  rtm += `\n`;
}

rtm += `## Summary\n\n`;
rtm += `| Metric | Value |\n|---|---|\n`;
rtm += `| Total requirements | ${totalReq} |\n`;
rtm += `| Total scenarios | ${totalScn} |\n`;
rtm += `| Total test cases | ${totalTc} |\n`;
rtm += `| Requirements with zero scenarios | ${uncoveredReq.length} ${uncoveredReq.length ? "(" + uncoveredReq.join(", ") + ")" : ""} |\n`;
rtm += `| Real executions recorded | ${executions.length} |\n`;
rtm += `| Real defects logged | ${MODULES.reduce((n, m) => n + data[m].defects.length, 0)} |\n`;

fs.writeFileSync(path.join(ROOT, "qa", "traceability", "RTM.md"), rtm);
console.log(`RTM.md written: ${totalReq} requirements, ${totalScn} scenarios, ${totalTc} test cases`);

// ---------- Dashboard ----------
function pct(n, d) { return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`; }

let dash = `# QA Dashboard\n\n`;
dash += `**GENERATED FILE — do not hand-edit.** Regenerate with \`node scripts/qa/generate-reports.js\`. Every number below is computed directly from qa/*.yaml at generation time — nothing here is hardcoded or estimated.\n\n`;
dash += `_Generated at: ${new Date().toISOString()}_\n\n`;

dash += `## Coverage\n\n`;
dash += `| Module | Requirements | Scenarios | Test Cases | Avg TC/Requirement |\n|---|---|---|---|---|\n`;
let gTotalReq = 0, gTotalScn = 0, gTotalTc = 0;
for (const m of MODULES) {
  const { requirements, scenarios, testCases } = data[m];
  gTotalReq += requirements.length; gTotalScn += scenarios.length; gTotalTc += testCases.length;
  dash += `| ${m.toUpperCase()} | ${requirements.length} | ${scenarios.length} | ${testCases.length} | ${(testCases.length / requirements.length).toFixed(1)} |\n`;
}
dash += `| **Total** | **${gTotalReq}** | **${gTotalScn}** | **${gTotalTc}** | **${(gTotalTc / gTotalReq).toFixed(1)}** |\n\n`;

dash += `## Execution status\n\n`;
dash += `No real execution has occurred yet in this environment — every test case is currently \`Not Executed\`. This section will populate automatically once qa/execution/*.yaml files contain real execution records.\n\n`;
dash += `| Module | Not Executed | Pass | Fail | Blocked | Skipped |\n|---|---|---|---|---|---|\n`;
for (const m of MODULES) {
  const tcs = data[m].testCases;
  const counts = { "Not Executed": 0, Pass: 0, Fail: 0, Blocked: 0, Skipped: 0 };
  for (const t of tcs) {
    const execs = executions.filter(e => e.test_case_id === t.id);
    const status = execs.length ? execs[execs.length - 1].status : t.status;
    counts[status] = (counts[status] || 0) + 1;
  }
  dash += `| ${m.toUpperCase()} | ${counts["Not Executed"]} | ${counts.Pass} | ${counts.Fail} | ${counts.Blocked} | ${counts.Skipped} |\n`;
}
dash += `\n`;

dash += `## Automation mapping\n\n`;
dash += `Evidence-based per qa/README.md's rule — Automated only where a specific test method is cited and verified to cover the exact test case.\n\n`;
dash += `| Module | Automated | PartiallyAutomated | CandidateForAutomation | ManualOnly | NotSuitable |\n|---|---|---|---|---|---|\n`;
let gAuto = {};
for (const m of MODULES) {
  const counts = {};
  for (const t of data[m].testCases) counts[t.automation_status] = (counts[t.automation_status] || 0) + 1;
  for (const k in counts) gAuto[k] = (gAuto[k] || 0) + counts[k];
  dash += `| ${m.toUpperCase()} | ${counts.Automated || 0} | ${counts.PartiallyAutomated || 0} | ${counts.CandidateForAutomation || 0} | ${counts.ManualOnly || 0} | ${counts.NotSuitable || 0} |\n`;
}
dash += `| **Total** | **${gAuto.Automated || 0}** | **${gAuto.PartiallyAutomated || 0}** | **${gAuto.CandidateForAutomation || 0}** | **${gAuto.ManualOnly || 0}** | **${gAuto.NotSuitable || 0}** |\n\n`;
dash += `Automated: ${pct(gAuto.Automated || 0, gTotalTc)} of all test cases.\n\n`;

dash += `## Priority breakdown (all modules)\n\n`;
{
  const counts = {};
  for (const m of MODULES) for (const t of data[m].testCases) counts[t.priority] = (counts[t.priority] || 0) + 1;
  dash += `| Priority | Count |\n|---|---|\n`;
  for (const p of ["Critical", "High", "Medium", "Low"]) dash += `| ${p} | ${counts[p] || 0} |\n`;
  dash += `\n`;
}

dash += `## Ambiguous / blocked test cases\n\n`;
dash += `Test cases with no determinate expected outcome — established behavior, not a pre-judged pass/fail. See qa/requirements/_conflicts.md for the underlying requirement-level ambiguities.\n\n`;
dash += `| Module | Test Case | Title |\n|---|---|---|\n`;
for (const m of MODULES) {
  for (const t of data[m].testCases.filter(t => t.test_type === "Ambiguous")) {
    dash += `| ${m.toUpperCase()} | ${t.id} | ${t.title} |\n`;
  }
}
dash += `\n`;

dash += `## Defects\n\n`;
{
  const total = MODULES.reduce((n, m) => n + data[m].defects.length, 0);
  dash += total === 0
    ? `No defects logged yet — none have been fabricated ahead of real execution, per qa/README.md's rule.\n\n`
    : `${total} defects logged across all modules.\n\n`;
}

dash += `## Suites\n\n`;
{
  const suiteDir = path.join(ROOT, "qa", "suites");
  dash += `| Suite | Test Cases |\n|---|---|\n`;
  for (const f of fs.readdirSync(suiteDir).sort()) {
    const s = yaml.load(fs.readFileSync(path.join(suiteDir, f), "utf8"));
    dash += `| ${s.suite} | ${s.test_case_ids.length} |\n`;
  }
  dash += `\n`;
}

fs.writeFileSync(path.join(ROOT, "qa", "reports", "dashboard.md"), dash);
console.log(`dashboard.md written`);
