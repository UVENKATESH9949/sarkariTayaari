import { describe, expect, it } from "vitest";
import { mistakeAnalysisTemplate } from "./mistakeAnalysisTemplate";
import type { LearnerContext, QuestionContext } from "../context/types";

const question: QuestionContext = {
  questionId: "q1",
  questionType: "SINGLE_CHOICE",
  languageCode: "en",
  questionText: "A train travels 120 km in 2 hours. What is its average speed?",
  options: ["40 km/h", "50 km/h", "60 km/h", "70 km/h"],
  correctAnswer: "60 km/h",
  authoredExplanation: "Speed = distance / time.",
  subjectName: "Quantitative Aptitude",
  topicName: "Speed, Time and Distance",
  parentTopicName: null,
  difficultyCode: "MEDIUM",
  isPyq: false,
  pyqYear: null,
};

const learner = (state: LearnerContext["topicState"]): LearnerContext => ({
  targetExamCode: "SSC_CGL",
  topicState: state,
  healthScore: 45,
  recentAccuracyPercent: 45,
  evidenceLevel: "DEVELOPING_CONFIDENCE",
  attemptedCount: 12,
  reasonCodes: [],
  preferredLanguage: "en",
});

describe("mistakeAnalysisTemplate", () => {
  it("classifies a first-time wrong answer as the plainest type, not a guess at why", () => {
    const result = mistakeAnalysisTemplate(question, null, {
      selectedAnswerText: "50 km/h",
      timesAnsweredWrong: 1,
    });

    expect(result.taskId).toBe("MISTAKE_ANALYSIS");
    expect(result.mistakeType).toBe("KNOWLEDGE_GAP");
    expect(result.explanation).toContain("60 km/h");
    expect(result.suggestedAction).toContain("Speed, Time and Distance");
  });

  it("classifies a repeat as REPEATED_MISTAKE, which is the one type history alone can establish", () => {
    const result = mistakeAnalysisTemplate(question, null, {
      selectedAnswerText: "50 km/h",
      timesAnsweredWrong: 3,
    });

    expect(result.mistakeType).toBe("REPEATED_MISTAKE");
    expect(result.explanation).toContain("wrong before");
  });

  it("does not tell an unanswered question it had a wrong answer to correct", () => {
    const result = mistakeAnalysisTemplate(question, null, {
      selectedAnswerText: null,
      timesAnsweredWrong: null,
    });

    expect(result.mistakeType).toBe("KNOWLEDGE_GAP");
    expect(result.explanation).toContain("unanswered");
    // The correct answer is deliberately not quoted at someone who never chose anything.
    expect(result.explanation).not.toContain("60 km/h");
  });

  it("points at the topic rather than the question when the topic itself is already weak", () => {
    const weak = mistakeAnalysisTemplate(question, learner("NEEDS_ATTENTION"), {
      selectedAnswerText: "50 km/h",
      timesAnsweredWrong: 1,
    });
    expect(weak.suggestedAction).toContain("needs more attention");

    const healthy = mistakeAnalysisTemplate(question, learner("STRONG"), {
      selectedAnswerText: "50 km/h",
      timesAnsweredWrong: 1,
    });
    expect(healthy.suggestedAction).not.toContain("needs more attention");
  });

  it("never cites a learner number, even when one is available", () => {
    const result = mistakeAnalysisTemplate(question, learner("NEEDS_ATTENTION"), {
      selectedAnswerText: "50 km/h",
      timesAnsweredWrong: 1,
    });

    const prose = `${result.explanation} ${result.suggestedAction}`;
    expect(prose).not.toContain("45");
    expect(prose).not.toContain("12");
  });
});
