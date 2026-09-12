// Generates qa/suites/*.yaml from the real test-case files. Suite membership is either a
// curated, explicit id list (Smoke — deliberately hand-picked, not "everything marked
// Critical") or a documented mechanical filter over real fields (priority/status/module).
// Nothing here invents a test case; every id referenced must exist in qa/test-cases/*.yaml.
//
// Run: node scripts/qa/generate-suites.js

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

const allTcs = {};
for (const m of MODULES) {
  allTcs[m] = yaml.load(fs.readFileSync(path.join(ROOT, "qa", "test-cases", `${m}.yaml`), "utf8"));
}
const flat = MODULES.flatMap(m => allTcs[m].map(t => ({ ...t, _module: m })));
const byId = new Map(flat.map(t => [t.id, t]));

function writeSuite(fileName, meta, ids) {
  // validate every id exists
  const missing = ids.filter(id => !byId.has(id));
  if (missing.length) throw new Error(`${fileName}: references unknown test case ids: ${missing.join(", ")}`);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) throw new Error(`${fileName}: duplicate ids in suite: ${dup.join(", ")}`);

  const header = `# ${meta.name}\n#\n${meta.description.split("\n").map(l => `# ${l}`).join("\n")}\n#\n# ${ids.length} test case(s). Membership rule: ${meta.rule}\n\n`;
  const body = yaml.dump({ suite: meta.name, test_case_ids: ids }, { lineWidth: 100 });
  fs.writeFileSync(path.join(ROOT, "qa", "suites", fileName), header + body);
  console.log(`${fileName}: ${ids.length} test cases`);
}

// --- Smoke: deliberately hand-curated, not a mechanical filter. The smallest set that
// answers "is the system fundamentally alive" across all three modules. ---
const SMOKE_IDS = [
  "TC-AUTH-001", // registration works
  "TC-AUTH-005", // student login works
  "TC-AUTH-006", // admin login works
  "TC-AUTH-009", // logout works
  "TC-AUTH-011", // /me works
  "TC-AUTH-017", // requireAdmin gate distinguishes anon/student/admin
  "TC-AUTH-019", // public sync endpoints reachable with no auth
  "TC-CATALOG-001", // exam CRUD lifecycle works
  "TC-CATALOG-003", // public catalog read works with no auth
  "TC-CATALOG-044", // public structure sync serves real content
  "TC-CATALOG-049", // full offline catalog sync + browsing works end to end
  "TC-QUESTIONS-001", // question create works
  "TC-QUESTIONS-027", // full sync works
  "TC-QUESTIONS-037", // /live browsing works
];
writeSuite("smoke.yaml", {
  name: "Smoke",
  description: "The smallest set of checks that answer \"is the system fundamentally alive\" across AUTH, CATALOG, and QUESTIONS. Hand-curated, not a mechanical priority filter — real smoke suites are deliberately small and specific, not \"everything marked Critical.\"",
  rule: "Hand-picked (see this script's SMOKE_IDS list).",
}, SMOKE_IDS);

// --- Sanity: every Critical-priority test case that has a determinate expected outcome
// (excludes Ambiguous cases, which have no pass/fail expectation by design). ---
const sanityIds = flat.filter(t => t.priority === "Critical" && t.test_type !== "Ambiguous").map(t => t.id);
writeSuite("sanity.yaml", {
  name: "Sanity",
  description: "Every Critical-priority test case with a determinate expected outcome. Broader than Smoke, still fast — the standard \"did this area still work\" check after a focused change.",
  rule: "priority == Critical AND test_type != Ambiguous (mechanical filter over qa/test-cases/*.yaml).",
}, sanityIds);

// --- Full regression: everything. ---
writeSuite("regression-full.yaml", {
  name: "Regression (Full)",
  description: "Every test case across all three modules, including Ambiguous/blocked ones (their execution still records real observed behavior, even without a pre-asserted pass/fail). Run before a significant, cross-cutting change.",
  rule: "All test cases in qa/test-cases/*.yaml.",
}, flat.map(t => t.id));

// --- Per-module (feature) regression ---
for (const m of MODULES) {
  writeSuite(`regression-${m}.yaml`, {
    name: `Regression — ${m.toUpperCase()}`,
    description: `Every test case belonging to the ${m.toUpperCase()} module. Run after any change confined to that module.`,
    rule: `module == ${m.toUpperCase()} (mechanical filter).`,
  }, allTcs[m].map(t => t.id));
}

// --- Release gate: Critical + High, excluding Ambiguous cases (no determinate pass/fail)
// and excluding cases whose own remarks flag them as hard to reliably reproduce on demand
// (a release gate must be reliably executable, not aspirational). ---
const HARD_TO_REPRODUCE = new Set([
  "TC-AUTH-014",       // needs a way to mint an already-expired token
  "TC-AUTH-020",       // fresh-environment-only (bootstrap)
  "TC-AUTH-021",       // fresh-environment-only (bootstrap)
  "TC-AUTH-025",       // needs real timing-measurement tooling
  "TC-QUESTIONS-025",  // needs a contrived DB flush failure
  "TC-QUESTIONS-051",  // needs a deliberately-broken Cloudinary config
]);
const releaseGateIds = flat
  .filter(t => (t.priority === "Critical" || t.priority === "High"))
  .filter(t => t.test_type !== "Ambiguous")
  .filter(t => !HARD_TO_REPRODUCE.has(t.id))
  .map(t => t.id);
writeSuite("release-gate.yaml", {
  name: "Release Gate",
  description: "Critical + High priority test cases, excluding Ambiguous cases (no determinate pass/fail to gate on) and a short, explicitly-listed set of cases that need a special/controlled environment to reproduce reliably on demand (see HARD_TO_REPRODUCE in the generator script) — a release gate must be reliably executable every time, not aspirational.",
  rule: "priority in [Critical, High] AND test_type != Ambiguous AND id not in HARD_TO_REPRODUCE.",
}, releaseGateIds);

// --- Critical business flows: honestly scoped. No independent cross-system E2E scenario/
// test-case pass has been done yet (would need its own Phase 2/3 work at INT-/E2E- scope).
// This suite assembles the most business-critical EXISTING per-module cases into the
// closest approximation of the real user journeys they compose, and says so plainly. ---
const CRITICAL_FLOW_IDS = [
  // Account creation -> sign-in -> session check
  "TC-AUTH-001", "TC-AUTH-005", "TC-AUTH-011",
  // Signed-out student can fully browse/sync the catalog offline
  "TC-CATALOG-003", "TC-CATALOG-044", "TC-CATALOG-049",
  // A question moves from authored -> synced -> visible to students
  "TC-QUESTIONS-001", "TC-QUESTIONS-027", "TC-QUESTIONS-047",
];
writeSuite("critical-flows.yaml", {
  name: "Critical Business Flow",
  description: "The closest current approximation of this project's real end-to-end user journeys, assembled from existing per-module test cases. HONEST SCOPE NOTE: no independent cross-system INT-/E2E- scenario or test-case pass has been done yet — that would need its own dedicated Phase 2/3 work spanning module boundaries. This suite is a starting point, not a substitute for that.",
  rule: "Hand-picked, composing existing per-module Critical-path cases into the closest approximation of a real user journey.",
}, CRITICAL_FLOW_IDS);
