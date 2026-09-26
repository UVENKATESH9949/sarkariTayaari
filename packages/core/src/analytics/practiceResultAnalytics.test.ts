import { describe, expect, it } from "vitest";
import { computePracticeResultAnalytics, toCompactInsightPayload, type AnalyticsQuestionInput } from "./practiceResultAnalytics";

function q(overrides: Partial<AnalyticsQuestionInput> & { questionNumber: number }): AnalyticsQuestionInput {
  return {
    questionId: `q${overrides.questionNumber}`,
    isCorrect: true,
    timeMs: 20_000,
    subtopicName: "Basic Percentage",
    difficultyCode: "MEDIUM",
    ...overrides,
  };
}

describe("computePracticeResultAnalytics — overall score", () => {
  it("computes accuracy, correct/incorrect counts, total and average time", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [
        q({ questionNumber: 1, isCorrect: true, timeMs: 10_000 }),
        q({ questionNumber: 2, isCorrect: false, timeMs: 20_000 }),
        q({ questionNumber: 3, isCorrect: true, timeMs: 30_000 }),
        q({ questionNumber: 4, isCorrect: true, timeMs: 40_000 }),
      ],
    });

    expect(analytics.score.questionsAttempted).toBe(4);
    expect(analytics.score.correctCount).toBe(3);
    expect(analytics.score.incorrectCount).toBe(1);
    expect(analytics.score.accuracyPercent).toBe(75);
    expect(analytics.score.totalTimeMs).toBe(100_000);
    expect(analytics.score.averageTimeMs).toBe(25_000);
  });

  it("treats a null timeMs as unmeasured, not zero", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [q({ questionNumber: 1, timeMs: null }), q({ questionNumber: 2, timeMs: null })],
    });
    expect(analytics.score.totalTimeMs).toBeNull();
    expect(analytics.score.averageTimeMs).toBeNull();
    expect(analytics.timeRule.medianTimeMs).toBeNull();
  });
});

describe("computePracticeResultAnalytics — time analysis", () => {
  it("flags a question spending far more than the session's median as high-time", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [
        q({ questionNumber: 1, timeMs: 20_000, isCorrect: true }),
        q({ questionNumber: 2, timeMs: 22_000, isCorrect: true }),
        q({ questionNumber: 3, timeMs: 21_000, isCorrect: false }),
        q({ questionNumber: 4, timeMs: 100_000, isCorrect: false }), // far above median
      ],
    });

    expect(analytics.highTimeQuestions.map((x) => x.questionNumber)).toEqual([4]);
  });

  it("never flags high-time on a session too small to have a meaningful median", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [q({ questionNumber: 1, timeMs: 5_000 }), q({ questionNumber: 2, timeMs: 200_000 })],
    });
    expect(analytics.highTimeQuestions).toEqual([]);
    expect(analytics.timeRule.medianTimeMs).toBeNull();
  });

  it("identifies fast-and-correct questions, but never fast-and-wrong", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [
        q({ questionNumber: 1, timeMs: 30_000, isCorrect: true }),
        q({ questionNumber: 2, timeMs: 32_000, isCorrect: true }),
        q({ questionNumber: 3, timeMs: 31_000, isCorrect: true }),
        q({ questionNumber: 4, timeMs: 5_000, isCorrect: true }), // fast + correct
        q({ questionNumber: 5, timeMs: 4_000, isCorrect: false }), // fast but WRONG — must not appear
      ],
    });

    expect(analytics.fastAccurateQuestions.map((x) => x.questionNumber)).toEqual([4]);
  });
});

describe("computePracticeResultAnalytics — sub-topic grouping", () => {
  it("groups questions by their own sub-topic, not the session's single topic name", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [
        q({ questionNumber: 1, subtopicName: "Basic Percentage", isCorrect: true }),
        q({ questionNumber: 2, subtopicName: "Basic Percentage", isCorrect: true }),
        q({ questionNumber: 3, subtopicName: "Basic Percentage", isCorrect: true }),
        q({ questionNumber: 4, subtopicName: "Successive Percentage", isCorrect: false }),
        q({ questionNumber: 5, subtopicName: "Successive Percentage", isCorrect: false }),
        q({ questionNumber: 6, subtopicName: "Successive Percentage", isCorrect: false }),
      ],
    });

    const names = analytics.subtopics.map((s) => s.name).sort();
    expect(names).toEqual(["Basic Percentage", "Successive Percentage"]);
    const basic = analytics.subtopics.find((s) => s.name === "Basic Percentage")!;
    expect(basic.accuracyPercent).toBe(100);
    expect(basic.performanceLabel).toBe("STRONG");
    const successive = analytics.subtopics.find((s) => s.name === "Successive Percentage")!;
    expect(successive.accuracyPercent).toBe(0);
    expect(successive.performanceLabel).toBe("WEAK");
  });

  it("labels a sub-topic WEAK and surfaces it in weakAreas when accuracy is low", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [
        q({ questionNumber: 1, subtopicName: "Successive Percentage", isCorrect: false }),
        q({ questionNumber: 2, subtopicName: "Successive Percentage", isCorrect: false }),
        q({ questionNumber: 3, subtopicName: "Successive Percentage", isCorrect: true }),
      ],
    });
    expect(analytics.weakAreas.map((s) => s.name)).toEqual(["Successive Percentage"]);
    expect(analytics.strongAreas).toEqual([]);
  });

  it("labels a sub-topic STRONG and surfaces it in strongAreas on high accuracy and normal pace", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [
        q({ questionNumber: 1, subtopicName: "Basic Percentage", isCorrect: true, timeMs: 15_000 }),
        q({ questionNumber: 2, subtopicName: "Basic Percentage", isCorrect: true, timeMs: 16_000 }),
        q({ questionNumber: 3, subtopicName: "Basic Percentage", isCorrect: true, timeMs: 14_000 }),
      ],
    });
    expect(analytics.strongAreas.map((s) => s.name)).toEqual(["Basic Percentage"]);
    expect(analytics.weakAreas).toEqual([]);
  });

  it("never confidently labels a sub-topic from fewer than 3 questions", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [
        q({ questionNumber: 1, subtopicName: "Rare Topic", isCorrect: false }),
        q({ questionNumber: 2, subtopicName: "Basic Percentage", isCorrect: true }),
        q({ questionNumber: 3, subtopicName: "Basic Percentage", isCorrect: true }),
        q({ questionNumber: 4, subtopicName: "Basic Percentage", isCorrect: true }),
      ],
    });
    const rare = analytics.subtopics.find((s) => s.name === "Rare Topic")!;
    expect(rare.performanceLabel).toBe("INSUFFICIENT_DATA");
    // Insufficient data is never counted as a weak area, even though its one answer was wrong.
    expect(analytics.weakAreas.some((s) => s.name === "Rare Topic")).toBe(false);
  });
});

describe("computePracticeResultAnalytics — previous performance", () => {
  it("reports NOT_AVAILABLE with no invented trend when no previous accuracy is supplied", () => {
    const analytics = computePracticeResultAnalytics({ questions: [q({ questionNumber: 1 })] });
    expect(analytics.previousPerformance.available).toBe(false);
    expect(analytics.previousPerformance.trend).toBe("NOT_AVAILABLE");
  });

  it("reports IMPROVING when accuracy rose by a meaningful margin", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [q({ questionNumber: 1, isCorrect: true }), q({ questionNumber: 2, isCorrect: true })],
      previousAccuracyPercent: 50,
    });
    expect(analytics.previousPerformance.trend).toBe("IMPROVING");
  });
});

describe("toCompactInsightPayload", () => {
  it("carries no question text, explanations or raw question ids — only what the AI needs", () => {
    const analytics = computePracticeResultAnalytics({
      questions: [q({ questionNumber: 1 }), q({ questionNumber: 2 }), q({ questionNumber: 3 })],
    });
    const payload = toCompactInsightPayload(analytics);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("questionId");
    expect(serialized).not.toContain("explanation");
  });
});
