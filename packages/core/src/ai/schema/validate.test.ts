import { describe, expect, it } from "vitest";

import { buildQuestionContext } from "../context/build";
import type { QuestionContext } from "../context/types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  answerMatches,
  groundedNarrative,
  hintRevealsAnswer,
  parseAiJson,
  validateAiResponse,
} from "./validate";

/**
 * Reads a JSON fixture from the repo-root `sample-data/` directory, shared with a Java-side
 * test asserting the identical cases against that side's implementation — see
 * `AiAnswerGroundingTest`/`PersonalNarrativeGroundingTest`.
 */
function readSharedFixture(name: string): { cases: Record<string, unknown>[] } {
  const path = fileURLToPath(new URL(`../../../../../sample-data/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

const CAPITALS: QuestionContext = buildQuestionContext({
  questionId: "q-1",
  questionType: "SINGLE_CHOICE",
  languageCode: "en",
  questionText: "What is the capital of West Bengal?",
  options: ["Mumbai", "Kolkata", "Chennai", "Patna"],
  correctAnswer: "Kolkata",
  authoredExplanation: "Kolkata is the capital of West Bengal.",
  subjectName: "General Awareness",
  topicName: "Indian States",
  difficultyCode: "EASY",
});

/** Legacy single-choice rows store a letter rather than the option text. Both must validate. */
const LETTER_ANSWER: QuestionContext = buildQuestionContext({
  ...CAPITALS,
  questionId: "q-2",
  correctAnswer: "B",
});

function explanation(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "QUESTION_EXPLANATION",
    answer: "Kolkata",
    whyCorrect: "Kolkata has been the state capital since 1947.",
    whyOthersWrong: [{ option: "Mumbai", why: "Mumbai is the capital of Maharashtra." }],
    concept: "State capitals",
    examTip: "State capitals recur in SSC General Awareness.",
    ...overrides,
  };
}

describe("parseAiJson", () => {
  it("parses plain JSON", () => {
    expect(parseAiJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("unwraps a fenced code block", () => {
    // Worth tolerating rather than re-billing for: instruction-tuned models add these constantly
    // and the payload inside is otherwise perfectly good.
    const result = parseAiJson('Here you go:\n```json\n{"a":1}\n```');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects malformed JSON rather than repairing it", () => {
    const result = parseAiJson("{ not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_JSON");
  });

  it("rejects an empty response", () => {
    const result = parseAiJson("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_JSON");
  });
});

describe("answerMatches", () => {
  const options = CAPITALS.options;

  it("accepts an exact match", () => {
    expect(answerMatches("Kolkata", "Kolkata", options)).toBe(true);
  });

  it("ignores casing and surrounding whitespace", () => {
    expect(answerMatches("  kolkata ", "Kolkata", options)).toBe(true);
  });

  it("accepts an option label the model added unprompted", () => {
    expect(answerMatches("B) Kolkata", "Kolkata", options)).toBe(true);
    expect(answerMatches("(b) Kolkata", "Kolkata", options)).toBe(true);
  });

  it("resolves a letter answer to its option text, in both directions", () => {
    expect(answerMatches("B", "Kolkata", options)).toBe(true);
    expect(answerMatches("Kolkata", "B", options)).toBe(true);
  });

  it("rejects a different option", () => {
    expect(answerMatches("Chennai", "Kolkata", options)).toBe(false);
    expect(answerMatches("C", "Kolkata", options)).toBe(false);
  });

  /**
   * `AiAnswerGrounding.java`'s own doc comment has long claimed both sides run this fixture —
   * that was only ever true of the Java side; this file never actually read it. Fixed in place
   * per this project's own standing rule about stale claims, found while adding the equivalent,
   * genuinely-new-this-time parity test for `groundedNarrative` below.
   */
  it("shared fixture parity — every case in ai-answer-grounding-fixtures.json", () => {
    const { cases } = readSharedFixture("ai-answer-grounding-fixtures.json");
    const failures: string[] = [];

    for (const c of cases) {
      const claimed = c.claimedAnswer as string;
      const correct = c.correctAnswer as string;
      const opts = c.options as string[];
      const expected = c.expectedMatch as boolean;
      const actual = answerMatches(claimed, correct, opts);
      if (actual !== expected) {
        failures.push(
          `claimed="${claimed}" correct="${correct}" options=${JSON.stringify(opts)} (${c.note}): expected ${expected}, got ${actual}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

describe("grounding — the check this layer exists for", () => {
  it("accepts an explanation of the verified answer", () => {
    const result = validateAiResponse("QUESTION_EXPLANATION", explanation(), { question: CAPITALS });
    expect(result.ok).toBe(true);
  });

  /**
   * The worst failure mode in exam prep, reduced to an equality check: the app already knows the
   * answer, so a model asserting a different one is mechanically wrong rather than a matter of
   * taste.
   */
  it("rejects an explanation of a different answer", () => {
    const result = validateAiResponse("QUESTION_EXPLANATION", explanation({ answer: "Chennai" }), {
      question: CAPITALS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNGROUNDED_ANSWER");
      expect(result.detail).toContain("Chennai");
      expect(result.detail).toContain("Kolkata");
    }
  });

  it("accepts option text when the stored answer is a letter", () => {
    const result = validateAiResponse("QUESTION_EXPLANATION", explanation(), {
      question: LETTER_ANSWER,
    });
    expect(result.ok).toBe(true);
  });

  it("skips grounding when no question is supplied", () => {
    // Deliberate: an admin previewing a generated row has no question to check against, and
    // making that an error would only push callers into inventing a fake one.
    const result = validateAiResponse("QUESTION_EXPLANATION", explanation({ answer: "anything" }));
    expect(result.ok).toBe(true);
  });
});

describe("shape validation", () => {
  it("rejects a non-object", () => {
    for (const raw of ["a string", 42, null, ["an", "array"]]) {
      const result = validateAiResponse("QUESTION_EXPLANATION", raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("NOT_AN_OBJECT");
    }
  });

  it("rejects a payload for a different task", () => {
    const result = validateAiResponse("QUESTION_HINT", explanation());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WRONG_TASK");
  });

  it("rejects a missing required field", () => {
    const { whyCorrect, ...withoutWhy } = explanation();
    void whyCorrect;
    const result = validateAiResponse("QUESTION_EXPLANATION", withoutWhy, { question: CAPITALS });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_FIELD");
  });

  it("rejects a blank required field", () => {
    const result = validateAiResponse("QUESTION_EXPLANATION", explanation({ whyCorrect: "   " }), {
      question: CAPITALS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMPTY_FIELD");
  });

  it("normalises absent optional fields to null", () => {
    const result = validateAiResponse(
      "QUESTION_EXPLANATION",
      explanation({ concept: undefined, examTip: "" }),
      { question: CAPITALS },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.concept).toBeNull();
      expect(result.value.examTip).toBeNull();
    }
  });

  it("tolerates an absent distractor list but not a malformed one", () => {
    const missing = validateAiResponse(
      "QUESTION_EXPLANATION",
      explanation({ whyOthersWrong: undefined }),
      { question: CAPITALS },
    );
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value.whyOthersWrong).toEqual([]);

    const malformed = validateAiResponse(
      "QUESTION_EXPLANATION",
      explanation({ whyOthersWrong: [{ option: "Mumbai" }] }),
      { question: CAPITALS },
    );
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.detail).toContain("whyOthersWrong[0]");
  });
});

describe("hints must not give the answer away", () => {
  it("accepts a hint about the method", () => {
    const result = validateAiResponse(
      "QUESTION_HINT",
      { taskId: "QUESTION_HINT", hint: "Think about which city sits on the Hooghly." },
      { question: CAPITALS },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a hint containing the answer", () => {
    const result = validateAiResponse(
      "QUESTION_HINT",
      { taskId: "QUESTION_HINT", hint: "The answer is Kolkata." },
      { question: CAPITALS },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("HINT_REVEALS_ANSWER");
  });

  it("does not flag a short numeric answer appearing incidentally", () => {
    // "divide by 12" must not be read as leaking the answer 12 — a validator that cries wolf
    // gets switched off, and the cost of a false reject is a wasted generation.
    const numeric = buildQuestionContext({
      ...CAPITALS,
      options: ["10", "12", "14", "16"],
      correctAnswer: "12",
    });
    expect(hintRevealsAnswer("Start by dividing by 12.", "12", numeric.options)).toBe(false);
  });

  it("matches on whole words only", () => {
    expect(hintRevealsAnswer("Consider Kolkata's river.", "Kolkata", CAPITALS.options)).toBe(true);
    expect(hintRevealsAnswer("Think about Kolkatan history.", "Kolkata", CAPITALS.options)).toBe(false);
  });
});

describe("closed enums and ranges", () => {
  it("rejects an invented mistake type", () => {
    const result = validateAiResponse("MISTAKE_ANALYSIS", {
      taskId: "MISTAKE_ANALYSIS",
      mistakeType: "VIBES",
      explanation: "x",
      suggestedAction: "y",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNKNOWN_ENUM");
  });

  it("accepts a taxonomy member", () => {
    const result = validateAiResponse("MISTAKE_ANALYSIS", {
      taskId: "MISTAKE_ANALYSIS",
      mistakeType: "CALCULATION_ERROR",
      explanation: "The method was right but the arithmetic slipped.",
      suggestedAction: "Redo five similar sums untimed.",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a confidence outside 0-1", () => {
    const result = validateAiResponse("QUESTION_CLASSIFICATION", {
      taskId: "QUESTION_CLASSIFICATION",
      suggestedTopicName: "Percentages",
      suggestedDifficultyCode: "EASY",
      confidence: 1.4,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OUT_OF_RANGE");
  });

  it("rejects a non-numeric confidence", () => {
    const result = validateAiResponse("QUESTION_CLASSIFICATION", {
      taskId: "QUESTION_CLASSIFICATION",
      suggestedTopicName: "Percentages",
      suggestedDifficultyCode: "EASY",
      confidence: "high",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WRONG_TYPE");
  });
});

describe("groundedNarrative — the check SESSION_FEEDBACK/PROFILE_SUMMARY exist for", () => {
  it("accepts a narrative that cites only given numbers and a given topic", () => {
    const result = groundedNarrative(
      "You answered 7 of 10 correctly (70%). Percentages needs more attention right now.",
      { allowedNumbers: [7, 10, 70], allowedTopicNames: ["Percentages"] },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a narrative that invents a number it was not given", () => {
    const result = groundedNarrative("You scored 95% today.", {
      allowedNumbers: [70],
      allowedTopicNames: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNGROUNDED_NARRATIVE");
  });

  it("rejects a generic narrative that names none of the given topics", () => {
    const result = groundedNarrative("You answered 7 of 10 correctly. Keep practicing!", {
      allowedNumbers: [7, 10],
      allowedTopicNames: ["Percentages"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNGROUNDED_NARRATIVE");
  });

  it("skips the topic-mention check when no topic names were supplied", () => {
    const result = groundedNarrative("You answered 7 of 10 correctly.", {
      allowedNumbers: [7, 10],
      allowedTopicNames: [],
    });
    expect(result.ok).toBe(true);
  });

  it("rounds decimals before comparing, so a stated 69.6% matches an allowed 70", () => {
    const result = groundedNarrative("You're at roughly 69.6% accuracy.", {
      allowedNumbers: [70],
      allowedTopicNames: [],
    });
    expect(result.ok).toBe(true);
  });

  it("shared fixture parity — every case in personal-narrative-grounding-fixtures.json", () => {
    const { cases } = readSharedFixture("personal-narrative-grounding-fixtures.json");
    const failures: string[] = [];

    for (const c of cases) {
      const narrative = c.narrative as string;
      const allowedNumbers = c.allowedNumbers as number[];
      const allowedTopicNames = c.allowedTopicNames as string[];
      const expected = c.expectedGrounded as boolean;
      const actual = groundedNarrative(narrative, { allowedNumbers, allowedTopicNames }).ok;
      if (actual !== expected) {
        failures.push(`narrative="${narrative}" (${c.note}): expected grounded=${expected}, got ${actual}`);
      }
    }

    expect(failures).toEqual([]);
  });
});

describe("validateAiResponse — SESSION_FEEDBACK / PROFILE_SUMMARY", () => {
  const narrativeGrounding = {
    allowedNumbers: [7, 10, 70],
    allowedTopicNames: ["Percentages"],
  };

  it("accepts a grounded session narrative", () => {
    const result = validateAiResponse(
      "SESSION_FEEDBACK",
      { taskId: "SESSION_FEEDBACK", narrative: "You answered 7 of 10 correctly (70%). Percentages needs work." },
      { narrative: narrativeGrounding },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.taskId).toBe("SESSION_FEEDBACK");
  });

  it("rejects an ungrounded session narrative", () => {
    const result = validateAiResponse(
      "SESSION_FEEDBACK",
      { taskId: "SESSION_FEEDBACK", narrative: "You answered 9 of 10 correctly." },
      { narrative: narrativeGrounding },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNGROUNDED_NARRATIVE");
  });

  it("accepts a grounded profile narrative", () => {
    const result = validateAiResponse(
      "PROFILE_SUMMARY",
      { taskId: "PROFILE_SUMMARY", narrative: "Percentages is at 70% and coming along." },
      { narrative: narrativeGrounding },
    );
    expect(result.ok).toBe(true);
  });

  it("skips narrative grounding when the caller supplied none, same posture as answer grounding", () => {
    const result = validateAiResponse("SESSION_FEEDBACK", {
      taskId: "SESSION_FEEDBACK",
      narrative: "Anything at all, 9999%.",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a blank narrative", () => {
    const result = validateAiResponse(
      "SESSION_FEEDBACK",
      { taskId: "SESSION_FEEDBACK", narrative: "   " },
      { narrative: narrativeGrounding },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMPTY_FIELD");
  });
});
