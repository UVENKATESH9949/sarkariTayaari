/**
 * Runs every case in `sample-data/question-evaluator-fixtures.json` against this package's
 * evaluator dispatch — the same file, the same two assertions, and the same `null`
 * answerConfig that the Java suite's `QuestionEvaluatorsTest.everyFixtureCaseHolds` uses.
 *
 * Until this file existed the TypeScript half of the deliberate Java/TypeScript duplication
 * had no automated test at all, in this project or anywhere (the fixture file's own comment
 * and the Java test's Javadoc both said so plainly: "verified by reading"). Sharing one
 * fixture file is what makes the two implementations checkable against each other rather
 * than merely intended to agree; a case added for one side now fails the other until both
 * are updated.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { questionEvaluatorFor } from "./questionEvaluator";
import type { EvaluationOutcome } from "./questionEvaluator";

type FixtureCase = {
  name: string;
  questionType: string;
  answerKey: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  expect: { outcome: EvaluationOutcome; scoreFraction: number };
};

const here = dirname(fileURLToPath(import.meta.url));
const fixturesPath = resolve(here, "../../../../sample-data/question-evaluator-fixtures.json");
const cases: FixtureCase[] = JSON.parse(readFileSync(fixturesPath, "utf8")).cases;

describe("questionEvaluatorFor — shared fixtures", () => {
  it("loads the same fixture file the Java suite asserts against", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const testCase of cases) {
    it(`${testCase.name} (${testCase.questionType})`, () => {
      const evaluate = questionEvaluatorFor(testCase.questionType);
      const result = evaluate(testCase.answerKey, null, testCase.response);

      expect(result.outcome).toBe(testCase.expect.outcome);
      expect(result.scoreFraction).toBe(testCase.expect.scoreFraction);
    });
  }
});
