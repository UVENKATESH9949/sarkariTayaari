import { describe, expect, it } from "vitest";

import type { LearnerProfileContext, TopicSnapshot } from "../context/types";
import { profileSummaryTemplate } from "./profileSummaryTemplate";

function snapshot(overrides: Partial<TopicSnapshot> = {}): TopicSnapshot {
  return {
    topicId: "t-1",
    topicName: "Percentages",
    subjectName: "Quantitative Aptitude",
    state: "NEEDS_ATTENTION",
    healthScore: 45,
    trend: "STABLE",
    reasonCodes: ["LOW_ACCURACY"],
    ...overrides,
  };
}

function profileContext(overrides: Partial<LearnerProfileContext> = {}): LearnerProfileContext {
  return {
    examCode: "SSC_CGL",
    overviewStatus: "BUILDING",
    topicsInSyllabus: 61,
    topicsWithEvidence: 23,
    strengths: [],
    weaknesses: [],
    preferredLanguage: "en",
    ...overrides,
  };
}

describe("profileSummaryTemplate — the DETERMINISTIC tier, not a fallback for 'nothing'", () => {
  it("always states coverage, even with no strengths/weaknesses", () => {
    const context = profileContext();
    const summary = profileSummaryTemplate(context);

    expect(summary.taskId).toBe("PROFILE_SUMMARY");
    expect(summary.narrative).toContain("23 of 61");
  });

  it("names a weakness before a strength, matching the radar's own tone", () => {
    const context = profileContext({
      weaknesses: [snapshot({ topicId: "t-weak", state: "NEEDS_ATTENTION" })],
      strengths: [snapshot({ topicId: "t-strong", state: "STRONG", topicName: "Ratios" })],
    });
    const summary = profileSummaryTemplate(context);

    expect(summary.narrative).toContain("needs more attention");
    expect(summary.narrative).toContain("Ratios");
    expect(summary.narrative.indexOf("needs more attention")).toBeLessThan(
      summary.narrative.indexOf("Ratios"),
    );
  });

  it("only names the single strongest weakness and strongest strength, not every topic given", () => {
    const context = profileContext({
      weaknesses: [
        snapshot({ topicId: "t-weak-1", topicName: "Percentages" }),
        snapshot({ topicId: "t-weak-2", topicName: "Ratios" }),
      ],
      strengths: [
        snapshot({ topicId: "t-strong-1", topicName: "Geometry", state: "STRONG" }),
        snapshot({ topicId: "t-strong-2", topicName: "Algebra", state: "STRONG" }),
      ],
    });
    const summary = profileSummaryTemplate(context);

    expect(summary.narrative).toContain("Percentages");
    expect(summary.narrative).not.toContain("Ratios");
    expect(summary.narrative).toContain("Geometry");
    expect(summary.narrative).not.toContain("Algebra");
  });
});
