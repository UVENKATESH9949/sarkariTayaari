import { describe, expect, it } from "vitest";

import type { RadarTopic, WeaknessRadar } from "../../intelligence/types";
import { AI_TASKS } from "../tasks";
import {
  MAX_PROFILE_TOPICS,
  MAX_REASON_CODES,
  assembleContext,
  buildExamContext,
  buildLearnerContext,
  buildLearnerProfileContext,
  buildQuestionContext,
  buildSessionContext,
  buildTopicContext,
  buildTopicSnapshot,
  contextGaps,
} from "./build";

const RADAR_TOPIC: RadarTopic = {
  topicId: "t-1",
  topicName: "Fundamental Rights",
  subjectId: "s-1",
  subjectName: "Polity",
  parentTopicName: "Constitution",
  state: "NEEDS_REVISION",
  healthScore: 53,
  trend: "DECLINING",
  trendDelta: -26,
  evidenceLevel: "RELIABLE",
  attemptedCount: 48,
  correctCount: 26,
  accuracyPercent: 54,
  recentAccuracyPercent: 53,
  historicalAccuracyPercent: 79,
  pyqAttemptedCount: 12,
  pyqAccuracyPercent: 50,
  speedAvailable: false,
  consistency: "VARIABLE",
  priority: 91,
  interventionValue: 43,
  questionCount: 120,
  reasonCodes: ["RECENT_DECLINE", "LOW_ACCURACY", "HIGH_EXAM_WEIGHT", "HIGH_VARIANCE"],
  explanation: "Used to be one of your stronger topics.",
  recommendedAction: { primary: "REVISION", steps: [] },
  unmetPrerequisites: [],
  lastPracticedAt: "2026-09-01T10:00:00Z",
};

describe("buildQuestionContext", () => {
  it("normalises blank optional text to null", () => {
    // "" and undefined must not mean two different things: both the prompt and the validator
    // branch on "is there an authored explanation at all".
    const context = buildQuestionContext({
      questionId: "q-1",
      questionType: "SINGLE_CHOICE",
      languageCode: "en",
      questionText: "Q?",
      options: ["A", "B"],
      correctAnswer: "A",
      authoredExplanation: "   ",
      subjectName: "Polity",
      topicName: "Rights",
      parentTopicName: "",
      difficultyCode: "EASY",
    });

    expect(context.authoredExplanation).toBeNull();
    expect(context.parentTopicName).toBeNull();
    expect(context.isPyq).toBe(false);
    expect(context.pyqYear).toBeNull();
  });

  it("copies the options rather than aliasing the caller's array", () => {
    const options = ["A", "B"];
    const context = buildQuestionContext({
      questionId: "q-1",
      questionType: "SINGLE_CHOICE",
      languageCode: "en",
      questionText: "Q?",
      options,
      correctAnswer: "A",
      subjectName: "Polity",
      topicName: "Rights",
      difficultyCode: "EASY",
    });

    options.push("C");
    expect(context.options).toEqual(["A", "B"]);
  });
});

describe("buildLearnerContext", () => {
  const learner = buildLearnerContext(RADAR_TOPIC, { examCode: "SSC_CGL", preferredLanguage: "en" });

  it("projects the already-computed diagnosis", () => {
    expect(learner).toEqual({
      targetExamCode: "SSC_CGL",
      topicState: "NEEDS_REVISION",
      healthScore: 53,
      recentAccuracyPercent: 53,
      evidenceLevel: "RELIABLE",
      attemptedCount: 48,
      reasonCodes: ["RECENT_DECLINE", "LOW_ACCURACY", "HIGH_EXAM_WEIGHT"],
      preferredLanguage: "en",
    });
  });

  it("caps reason codes, keeping the ranked head", () => {
    expect(learner.reasonCodes).toHaveLength(MAX_REASON_CODES);
    expect(learner.reasonCodes).not.toContain("HIGH_VARIANCE");
  });

  /**
   * §30's context-minimisation policy, asserted rather than trusted. This is the test that fails
   * if someone widens the type to "just include the whole radar topic" — which would put a
   * student's full history into a prompt, and for a cached task into everyone else's answer.
   */
  it("carries no identifier and no raw history", () => {
    const keys = Object.keys(learner);
    for (const forbidden of [
      "userId",
      "email",
      "name",
      "topicId",
      "topicName",
      "explanation",
      "correctCount",
      "lastPracticedAt",
      "unmetPrerequisites",
      "recommendedAction",
    ]) {
      expect(keys, `${forbidden} must not reach a prompt`).not.toContain(forbidden);
    }
    expect(JSON.stringify(learner)).not.toContain("Fundamental Rights");
  });
});

function radarTopic(overrides: Partial<RadarTopic>): RadarTopic {
  return { ...RADAR_TOPIC, ...overrides };
}

describe("buildTopicSnapshot", () => {
  it("projects a RadarTopic to the compact session/profile shape, capping reason codes", () => {
    const snapshot = buildTopicSnapshot(RADAR_TOPIC);

    expect(snapshot).toEqual({
      topicId: "t-1",
      topicName: "Fundamental Rights",
      subjectName: "Polity",
      state: "NEEDS_REVISION",
      healthScore: 53,
      trend: "DECLINING",
      reasonCodes: ["RECENT_DECLINE", "LOW_ACCURACY", "HIGH_EXAM_WEIGHT"],
    });
    expect(snapshot.reasonCodes).toHaveLength(MAX_REASON_CODES);
  });
});

describe("buildSessionContext", () => {
  it("computes accuracy from the given counts and projects every session topic", () => {
    const context = buildSessionContext({
      sessionKind: "PRACTICE",
      examCode: "SSC_CGL",
      answeredCount: 10,
      correctCount: 7,
      preferredLanguage: "en",
      sessionTopics: [radarTopic({ topicId: "t-1" }), radarTopic({ topicId: "t-2", state: "STRONG" })],
    });

    expect(context.sessionKind).toBe("PRACTICE");
    expect(context.examCode).toBe("SSC_CGL");
    expect(context.answeredCount).toBe(10);
    expect(context.correctCount).toBe(7);
    expect(context.accuracyPercent).toBe(70);
    expect(context.topics).toHaveLength(2);
    expect(context.topics[1].state).toBe("STRONG");
  });

  it("does not divide by zero when nothing was answered", () => {
    const context = buildSessionContext({
      sessionKind: "MOCK",
      examCode: null,
      answeredCount: 0,
      correctCount: 0,
      preferredLanguage: "en",
      sessionTopics: [],
    });
    expect(context.accuracyPercent).toBe(0);
    expect(context.topics).toEqual([]);
  });
});

describe("buildLearnerProfileContext", () => {
  const radar: WeaknessRadar = {
    examCode: "SSC_CGL",
    algorithmVersion: "TOPIC_HEALTH_V1",
    computedAt: "2026-09-01T00:00:00Z",
    overview: {
      status: "ON_TRACK",
      topicsInSyllabus: 61,
      topicsWithEvidence: 23,
      topicsReliable: 10,
      needsAttentionCount: 1,
      needsRevisionCount: 1,
      improvingCount: 1,
      strongCount: 1,
      developingCount: 0,
      insufficientDataCount: 0,
      headline: "On track",
    },
    // Already ranked, concern states first, strong states last — matching the real radar's
    // own ordering guarantee, which is what lets this builder skip re-ranking entirely.
    topics: [
      radarTopic({ topicId: "t-attn", state: "NEEDS_ATTENTION" }),
      radarTopic({ topicId: "t-rev", state: "NEEDS_REVISION" }),
      radarTopic({ topicId: "t-improving", state: "IMPROVING" }),
      radarTopic({ topicId: "t-strong", state: "STRONG" }),
    ],
  };

  it("takes weaknesses from the concern states and strengths from the strong states, unranked further", () => {
    const context = buildLearnerProfileContext(radar, { preferredLanguage: "en" });

    expect(context.examCode).toBe("SSC_CGL");
    expect(context.overviewStatus).toBe("ON_TRACK");
    expect(context.topicsInSyllabus).toBe(61);
    expect(context.topicsWithEvidence).toBe(23);
    expect(context.weaknesses.map((t) => t.topicId)).toEqual(["t-attn", "t-rev"]);
    expect(context.strengths.map((t) => t.topicId)).toEqual(["t-improving", "t-strong"]);
  });

  it("caps each side at MAX_PROFILE_TOPICS", () => {
    const manyWeak: WeaknessRadar = {
      ...radar,
      topics: Array.from({ length: 10 }, (_, i) =>
        radarTopic({ topicId: `t-weak-${i}`, state: "NEEDS_ATTENTION" }),
      ),
    };
    const context = buildLearnerProfileContext(manyWeak, { preferredLanguage: "en" });
    expect(context.weaknesses).toHaveLength(MAX_PROFILE_TOPICS);
  });
});

describe("assembleContext", () => {
  const question = buildQuestionContext({
    questionId: "q-1",
    questionType: "SINGLE_CHOICE",
    languageCode: "en",
    questionText: "Q?",
    options: ["A", "B"],
    correctAnswer: "A",
    subjectName: "Polity",
    topicName: "Rights",
    difficultyCode: "EASY",
  });
  const learner = buildLearnerContext(RADAR_TOPIC, { examCode: "SSC_CGL", preferredLanguage: "en" });
  const exam = buildExamContext({ examCode: "SSC_CGL", examName: "SSC CGL" });
  const topic = buildTopicContext({ topicId: "t-1", topicName: "Rights", subjectName: "Polity" });

  /**
   * The mistake this guards against is invisible in review and catastrophic in a cache: a
   * shared, cached explanation built from one student's performance, then served to everyone.
   */
  it("drops context the task did not ask for", () => {
    const assembled = assembleContext(AI_TASKS.QUESTION_EXPLANATION, {
      question,
      learner,
      exam,
      topic,
    });

    expect(assembled.question).toBeDefined();
    expect(assembled.learner).toBeUndefined();
    expect(assembled.exam).toBeUndefined();
    expect(assembled.topic).toBeUndefined();
  });

  it("keeps context a personalized task is entitled to", () => {
    const assembled = assembleContext(AI_TASKS.MISTAKE_ANALYSIS, { question, learner, exam });

    expect(assembled.question).toBeDefined();
    expect(assembled.learner).toBeDefined();
    expect(assembled.exam).toBeUndefined();
  });

  it("keeps session context for SESSION_FEEDBACK and drops everything else", () => {
    const session = buildSessionContext({
      sessionKind: "PRACTICE",
      examCode: "SSC_CGL",
      answeredCount: 5,
      correctCount: 3,
      preferredLanguage: "en",
      sessionTopics: [],
    });
    const assembled = assembleContext(AI_TASKS.SESSION_FEEDBACK, { session, question, learner });

    expect(assembled.session).toBeDefined();
    expect(assembled.question).toBeUndefined();
    expect(assembled.learner).toBeUndefined();
  });
});

describe("contextGaps", () => {
  it("is empty when everything required is present", () => {
    const context = assembleContext(AI_TASKS.QUESTION_EXPLANATION, {
      question: buildQuestionContext({
        questionId: "q-1",
        questionType: "SINGLE_CHOICE",
        languageCode: "en",
        questionText: "Q?",
        options: ["A"],
        correctAnswer: "A",
        subjectName: "Polity",
        topicName: "Rights",
        difficultyCode: "EASY",
      }),
    });
    expect(contextGaps(AI_TASKS.QUESTION_EXPLANATION, context)).toEqual([]);
  });

  it("names what is missing", () => {
    expect(contextGaps(AI_TASKS.MISTAKE_ANALYSIS, {})).toEqual(["question", "learner"]);
  });
});
