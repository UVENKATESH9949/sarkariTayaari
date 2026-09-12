// Generates qa/test-data/<module>.yaml from a hand-authored description table plus the
// real TESTDATA-* references found in qa/test-cases/<module>.yaml. The description/
// provisioning text is authored here (logical meaning only, no real credentials); the
// used_by_test_cases list is computed, not hand-transcribed, so it can't drift from the
// actual test cases.
//
// Run: node scripts/qa/generate-test-data.js

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "..", "..");

// Logical meaning per identifier. NEVER put a real email/password/token here — provisioning
// notes describe HOW to create the fixture per environment, not a literal value to reuse.
const DESCRIPTIONS = {
  // AUTH
  "TESTDATA-AUTH-STUDENT-01": {
    type: "Account",
    description: "A registered STUDENT account with a known password, reused across multiple AUTH test cases as 'the' ordinary student fixture.",
    provisioning: "Register via POST /api/auth/register if no environment fixture already exists. Do not record the actual password in this repository.",
  },
  "TESTDATA-AUTH-ADMIN-01": {
    type: "Account",
    description: "A registered ADMIN account with a known password, reused across multiple AUTH test cases as 'the' ordinary admin fixture. Other test cases depend on this account remaining ADMIN — do not use it for a case that changes its role (see TESTDATA-AUTH-ADMIN-02).",
    provisioning: "Use an existing admin fixture (e.g. the automated-test-admin pattern documented in memory/STATUS.md) or create via POST /api/auth/admin/register from another admin.",
  },
  "TESTDATA-AUTH-ADMIN-02": {
    type: "Account",
    description: "A dedicated, throwaway ADMIN account used only for TC-AUTH-018 (role-demotion mid-session). Kept separate from TESTDATA-AUTH-ADMIN-01 specifically so demoting it does not affect any other test case's admin fixture.",
    provisioning: "Create a fresh admin account for this run; restore or discard it after execution per TC-AUTH-018's own remarks.",
  },
  "TESTDATA-AUTH-VALID-PASSWORD-01": {
    type: "Value shape",
    description: "Any password meeting the documented minimum (>=8 characters, no other complexity rule). Not a literal value — generate a fresh one per execution.",
    provisioning: "Generate at execution time; never reuse a real user's password.",
  },
  "TESTDATA-AUTH-NEW-EMAIL-01": { type: "Value shape", description: "A syntactically valid, not-yet-registered email for a fresh registration test.", provisioning: "Generate a unique address per execution (e.g. a timestamp/uuid-suffixed local part) so re-running the suite doesn't collide with a prior run's leftover account." },
  "TESTDATA-AUTH-NEW-EMAIL-02": { type: "Value shape", description: "Same shape as TESTDATA-AUTH-NEW-EMAIL-01, submitted in mixed case to test lower-casing normalization.", provisioning: "Generate a unique, mixed-case address per execution." },
  "TESTDATA-AUTH-NEW-EMAIL-03": { type: "Value shape", description: "Same shape as TESTDATA-AUTH-NEW-EMAIL-01, used alongside a too-short password.", provisioning: "Generate a unique address per execution." },
  "TESTDATA-AUTH-EXISTING-EMAIL-01": { type: "Account", description: "An email already registered to some account, used to test duplicate-registration rejection. Register it as a setup step if the environment has no standing fixture for it.", provisioning: "Register once per environment, or reuse TESTDATA-AUTH-STUDENT-01's own email if convenient." },
  "TESTDATA-AUTH-UNKNOWN-EMAIL-01": { type: "Value shape", description: "An email guaranteed never to have been registered, for login-against-unknown-account negative tests.", provisioning: "Generate a unique, never-registered address per execution." },
  "TESTDATA-AUTH-UNKNOWN-EMAIL-02": { type: "Value shape", description: "Same shape as TESTDATA-AUTH-UNKNOWN-EMAIL-01, used specifically in the timing-safety case.", provisioning: "Generate a unique, never-registered address per execution." },
  "TESTDATA-AUTH-NEW-ADMIN-EMAIL-01": { type: "Value shape", description: "A not-yet-registered email for the admin-invites-admin authorization-matrix case.", provisioning: "Generate a unique address per execution; clean up the created admin account afterward per TC-AUTH-022's remarks." },
  "TESTDATA-AUTH-NEW-ADMIN-EMAIL-02": { type: "Value shape", description: "A not-yet-registered email for the admin-invites-admin no-token-leak case, kept separate from -01 so the two cases' cleanup doesn't collide.", provisioning: "Generate a unique address per execution; clean up afterward per TC-AUTH-023's remarks." },

  // CATALOG
  "TESTDATA-CATALOG-NEW-EXAM-CODE-01": { type: "Value shape", description: "An exam code not currently in use, for the full-CRUD-lifecycle case (created then deleted within the same test).", provisioning: "Generate a unique code per execution (e.g. a short random suffix) so re-runs don't collide." },
  "TESTDATA-CATALOG-EXISTING-EXAM-CODE-01": { type: "Fixture", description: "An existing, active exam reused across many CATALOG cases as 'the' ordinary exam fixture for syllabus/topic-map/stage/paper/section operations. Cases that mutate its structure should use a throwaway stage/paper/section under it, not delete the exam itself.", provisioning: "Use an existing seeded exam (e.g. SSC_CGL) in the target environment, or create a dedicated throwaway exam reserved for QA use." },
  "TESTDATA-CATALOG-NEW-SUBJECT-NAME-01": { type: "Value shape", description: "A subject name not currently in use.", provisioning: "Generate a unique name per execution." },
  "TESTDATA-CATALOG-EXISTING-SUBJECT-NAME-01": { type: "Fixture", description: "An existing subject name, used to test case-insensitive duplicate rejection.", provisioning: "Use any existing subject in the target environment." },
  "TESTDATA-CATALOG-NEW-TOPIC-NAME-01": { type: "Value shape", description: "A topic name not currently in use under the subject being tested.", provisioning: "Generate a unique name per execution." },
  "TESTDATA-CATALOG-SHARED-TOPIC-NAME-01": { type: "Value shape", description: "A topic name deliberately created under two different subjects, to prove per-subject uniqueness scoping.", provisioning: "Generate a unique name per execution; create it under both subjectA and subjectB." },
  "TESTDATA-CATALOG-LANG-CODE-01": { type: "Fixture", description: "A dedicated, throwaway language code — deliberately NOT a real content language like en/hi, since the active/all-split test deactivates it and that must not affect any other test relying on real content languages.", provisioning: "Create a throwaway language code reserved for QA use." },
  "TESTDATA-CATALOG-NEW-DIFFICULTY-CODE-01": { type: "Value shape", description: "A difficulty-level code not currently in use, for the 'new level usable with no code change' case.", provisioning: "Generate a unique code per execution." },
  "TESTDATA-CATALOG-EXISTING-DIFFICULTY-CODE-01": { type: "Fixture", description: "An existing difficulty-level code, used to test duplicate-code rejection.", provisioning: "Use any existing difficulty level in the target environment." },
  "TESTDATA-CATALOG-BADGE-CODE-01": { type: "Fixture", description: "An existing exam badge code. Badges are documented as read-only via the API (REQ-CATALOG-020) — if no way exists to toggle its active flag through any available interface, TC-CATALOG-046 should be marked Blocked rather than fabricate a result.", provisioning: "Use an existing seeded badge, or locate a pre-existing inactive one instead of trying to create one via API." },

  // QUESTIONS
  "TESTDATA-QUESTIONS-TOPIC-01": { type: "Fixture", description: "An existing topic, used across several QUESTIONS cases needing a valid topicId.", provisioning: "Use an existing seeded topic in the target environment." },
  "TESTDATA-QUESTIONS-DIFFICULTY-01": { type: "Fixture", description: "An existing difficulty-level code, used across several QUESTIONS cases needing a valid difficulty.", provisioning: "Use an existing seeded difficulty level (e.g. 'easy')." },
  "TESTDATA-QUESTIONS-EXAMCODE-01": { type: "Fixture", description: "An existing, active exam code, used across several QUESTIONS cases needing a valid examCodes entry.", provisioning: "Use an existing seeded exam (e.g. SSC_CGL)." },
  "TESTDATA-QUESTIONS-SUBJECT-01": { type: "Fixture", description: "An existing subject with a known mix of PUBLISHED, DRAFT, and soft-deleted questions under it, for the /counts grouping case.", provisioning: "Use an existing subject, or seed the DRAFT/soft-deleted rows needed for TC-QUESTIONS-039 as a setup step." },
  "TESTDATA-QUESTIONS-NEW-SUBJECT-NAME-01": { type: "Value shape", description: "A subject name not currently in use, for the bulk-import auto-create case.", provisioning: "Generate a unique name per execution." },
  "TESTDATA-QUESTIONS-NEW-TOPIC-NAME-01": { type: "Value shape", description: "A topic name not currently in use, for the bulk-import auto-create case.", provisioning: "Generate a unique name per execution." },
};

function usedBy(tcs, id) {
  return tcs.filter(t => JSON.stringify(t).includes(id)).map(t => t.id);
}

// Derived from qa/test-cases/ rather than hardcoded. The module list used to be a literal
// here and in generate-suites.js and generate-reports.js, so a newly added module produced no
// test-data, no suite membership and no RTM row until someone found and edited all three
// independently. Found when the WEB module was added (TASK-2601).
const MODULES = fs
  .readdirSync(path.join(ROOT, "qa", "test-cases"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => f.replace(/\.yaml$/, ""))
  .sort();

for (const mod of MODULES) {
  const tcPath = path.join(ROOT, "qa", "test-cases", `${mod}.yaml`);
  const tcs = yaml.load(fs.readFileSync(tcPath, "utf8"));
  const text = JSON.stringify(tcs);
  const ids = [...new Set([...text.matchAll(/TESTDATA-[A-Z0-9-]+/g)].map(m => m[0]))].sort();

  const missing = ids.filter(id => !DESCRIPTIONS[id]);
  if (missing.length) {
    console.error(`${mod}: missing description for`, missing);
    process.exitCode = 1;
    continue;
  }

  const header = `# ${mod.toUpperCase()} module — test data catalog\n#\n# Logical test-data identifiers only. NEVER a real credential, token, or personal data —\n# every entry describes what the identifier MEANS and how to provision it per environment,\n# not a literal reusable value. used_by_test_cases is computed from the real test-case\n# files, not hand-maintained (regenerate via scripts/qa/generate-test-data.js).\n\n`;
  const entries = ids.map(id => {
    const d = DESCRIPTIONS[id];
    const usedByList = usedBy(tcs, id);
    return yaml.dump([{
      id,
      type: d.type,
      description: d.description,
      provisioning: d.provisioning,
      used_by_test_cases: usedByList,
    }], { lineWidth: 100 });
  }).join("\n");

  fs.writeFileSync(path.join(ROOT, "qa", "test-data", `${mod}.yaml`), header + entries);
  console.log(`${mod}: wrote ${ids.length} test-data entries`);
}
