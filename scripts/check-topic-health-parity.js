#!/usr/bin/env node
/**
 * Checks that the two copies of the Weakness Radar topic-health algorithm still agree on their
 * constants (TASK-2201).
 *
 * ## Why this exists
 *
 * The scoring rules are implemented twice on purpose — in Java for signed-in students, and in
 * TypeScript for signed-out ones, whose attempts never reach a server that could score them.
 * That decision was taken deliberately and follows the precedent of the mastery ladder, which
 * this codebase already mirrors. But two copies can drift, and a comment asking someone to keep
 * them in step is not a check.
 *
 * This is the cheap half of the defence: every constant that both sides are supposed to share
 * must exist in both with the same value, and the algorithm version must match. The expensive
 * half is `sample-data/weakness-radar-fixtures.json`, which states what the rules should
 * *produce* — asserted on the Java side by `TopicHealthScoringTest`. Neither catches a rule
 * whose logic diverged while its constants stayed put, so this is a floor, not a guarantee.
 *
 * Usage:  node scripts/check-topic-health-parity.js
 * Exits non-zero on any mismatch, so it is usable as a pre-commit or CI step.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const JAVA = path.join(
  root,
  "backend/src/main/java/com/sarkaritaiyaari/backend/service/TopicHealthService.java",
);
const TS = path.join(root, "packages/core/src/intelligence/topicHealth.ts");
const FIXTURES = path.join(root, "sample-data/weakness-radar-fixtures.json");

/**
 * Constants that exist on only one side, legitimately.
 *
 * `MAX_CACHE_AGE_HOURS` is the server's cache-staleness policy; the device path computes fresh
 * every time and has no cache to age. `DAY_MS` is a units helper the Java side expresses with
 * `Duration` instead.
 */
const JAVA_ONLY = new Set(["MAX_CACHE_AGE_HOURS"]);
const TS_ONLY = new Set(["DAY_MS"]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function readNumbers(file, pattern) {
  const source = fs.readFileSync(file, "utf8");
  const found = new Map();
  for (const match of source.matchAll(pattern)) {
    found.set(match[1], Number(match[2]));
  }
  return { source, found };
}

const java = readNumbers(JAVA, /static final (?:int|double) ([A-Z_]+) = ([0-9.]+)/g);
const ts = readNumbers(TS, /(?:export )?const ([A-Z_]+) = ([0-9.]+)/g);

if (java.found.size === 0 || ts.found.size === 0) {
  fail("could not parse constants out of one of the two files — has one been renamed or moved?");
  process.exit(1);
}

// Version: stored on every row and shipped in every response, so a mismatch means two clients
// disagree about which formula produced a score.
const javaVersion = /ALGORITHM_VERSION = "([^"]+)"/.exec(java.source)?.[1];
const tsVersion = /ALGORITHM_VERSION = "([^"]+)"/.exec(ts.source)?.[1];
if (!javaVersion || !tsVersion) {
  fail("could not find ALGORITHM_VERSION in one of the two files");
} else if (javaVersion !== tsVersion) {
  fail(`ALGORITHM_VERSION differs: Java "${javaVersion}" vs TypeScript "${tsVersion}"`);
}

const fixtureVersion = JSON.parse(fs.readFileSync(FIXTURES, "utf8")).algorithmVersion;
if (fixtureVersion !== javaVersion) {
  fail(
    `the shared fixtures were written for "${fixtureVersion}" but the code is at ` +
      `"${javaVersion}" — every expectation in them was agreed against a specific formula`,
  );
}

for (const [name, value] of java.found) {
  if (JAVA_ONLY.has(name)) continue;
  if (!ts.found.has(name)) {
    fail(`${name} = ${value} exists in Java but not in TypeScript`);
  } else if (ts.found.get(name) !== value) {
    fail(`${name} differs: Java ${value} vs TypeScript ${ts.found.get(name)}`);
  }
}

for (const [name, value] of ts.found) {
  if (TS_ONLY.has(name)) continue;
  if (!java.found.has(name)) {
    fail(`${name} = ${value} exists in TypeScript but not in Java`);
  }
}

// The declared weights must still sum to 1.00 on both sides. Both files assert this themselves
// at startup, but a drift here is worth catching before it reaches a device.
const weightNames = [
  "W_ACCURACY",
  "W_TREND",
  "W_SPEED",
  "W_CONSISTENCY",
  "W_DIFFICULTY",
  "W_PYQ",
  "W_RETENTION",
];
for (const [label, found] of [["Java", java.found], ["TypeScript", ts.found]]) {
  const sum = weightNames.reduce((total, name) => total + (found.get(name) ?? 0), 0);
  if (Math.abs(sum - 1) > 1e-9) {
    fail(`${label} component weights sum to ${sum}, not 1.00`);
  }
}

if (process.exitCode) {
  console.error(
    "\nThe two copies of the topic-health algorithm have drifted. See TASK-2201 and the module\n" +
      "comment in packages/core/src/intelligence/topicHealth.ts: change both sides together, and bump\n" +
      "ALGORITHM_VERSION in both when the formula itself changes.",
  );
} else {
  console.log(
    `OK: ${java.found.size - JAVA_ONLY.size} shared constants agree, ` +
      `ALGORITHM_VERSION is "${javaVersion}" on both sides and in the fixtures, ` +
      `and the component weights sum to 1.00 in both.`,
  );
}
