import { describe, expect, it } from "vitest";

import { buildSessionContext } from "../context/build";
import type { RadarTopic } from "../../intelligence/types";
import { sessionFeedbackTemplate } from "./sessionFeedbackTemplate";

function radarTopic(overrides: Partial<RadarTopic> = {}): RadarTopic {
  return {
    topicId: "t-1",
    topicName: "Percentages",
    subjectId: "s-1",
    subjectName: "Quantitative Aptitude",
    parentTopicName: null,
    state: "NEEDS_ATTENTION",
    healthScore: 45,
    trend: "STABLE",
    trendDelta: null,
    evidenceLevel: "RELIABLE",
    attemptedCount: 20,
    correctCount: 9,
    accuracyPercent: 45,
    recentAccuracyPercent: 45,
    historicalAccuracyPercent: 45,
    pyqAttemptedCount: 0,
    pyqAccuracyPercent: null,
    speedAvailable: false,
    consistency: "STEADY",
    priority: 50,
    interventionValue: 50,
    questionCount: 100,
    reasonCodes: ["LOW_ACCURACY"],
    explanation: "",
    recommendedAction: { primary: "PRACTICE_FOUNDATIONAL", steps: [] },
    unmetPrerequisites: [],
    lastPracticedAt: null,
    ...overrides,
  };
}

describe("sessionFeedbackTemplate — the DETERMINISTIC tier, not a fallback for 'nothing'", () => {
  it("always states the score, even with no topics", () => {
    const context = buildSessionContext({
      sessionKind: "PRACTICE",
      examCode: "SSC_CGL",
      answeredCount: 10,
      correctCount: 7,
      preferredLanguage: "en",
      sessionTopics: [],
    });
    const feedback = sessionFeedbackTemplate(context);

    expect(feedback.taskId).toBe("SESSION_FEEDBACK");
    expect(feedback.narrative).toContain("7 of 10");
    expect(feedback.narrative).toContain("70%");
  });

  it("names a weak topic before a strong one, matching the radar's own tone", () => {
    const context = buildSessionContext({
      sessionKind: "PRACTICE",
      examCode: "SSC_CGL",
      answeredCount: 10,
      correctCount: 7,
      preferredLanguage: "en",
      sessionTopics: [
        radarTopic({ topicId: "t-weak", state: "NEEDS_ATTENTION" }),
        radarTopic({ topicId: "t-strong", state: "STRONG", topicName: "Ratios" }),
      ],
    });
    const feedback = sessionFeedbackTemplate(context);

    expect(feedback.narrative).toContain("needs more attention");
    expect(feedback.narrative).toContain("Ratios");
    expect(feedback.narrative.indexOf("needs more attention")).toBeLessThan(
      feedback.narrative.indexOf("Ratios"),
    );
  });

  it("never names the same topic as both weak and strong", () => {
    const onlyTopic = radarTopic({ topicId: "t-1", state: "NEEDS_ATTENTION" });
    const context = buildSessionContext({
      sessionKind: "PRACTICE",
      examCode: "SSC_CGL",
      answeredCount: 5,
      correctCount: 2,
      preferredLanguage: "en",
      sessionTopics: [onlyTopic],
    });
    const feedback = sessionFeedbackTemplate(context);

    // Exactly one topic sentence, not a duplicate framed two ways.
    expect(feedback.narrative.match(/Percentages/g)?.length).toBe(1);
  });
});
