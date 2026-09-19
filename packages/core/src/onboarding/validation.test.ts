import { describe, expect, it } from "vitest";

import {
  DISPLAY_NAME_MAX_LENGTH,
  TARGET_YEAR_HORIZON,
  normaliseDisplayName,
  supportedUiLanguages,
  targetYearOptions,
  validateDailyStudyTime,
  validateDisplayName,
  validateExamCode,
  validateExamStageId,
  validateLanguage,
  validateContentLanguages,
  toggleContentLanguage,
  validatePreparationLevel,
  validateProfileDraft,
  validateTargetYear,
  type ProfileDraft,
} from "./validation";
import { CATALOGUES } from "../i18n";

describe("display name", () => {
  it("accepts an ordinary name unchanged", () => {
    expect(validateDisplayName("Venkatesh")).toEqual({ ok: true, value: "Venkatesh" });
  });

  it("trims surrounding whitespace", () => {
    expect(validateDisplayName("  Priya  ")).toEqual({ ok: true, value: "Priya" });
  });

  it("collapses runs of whitespace inside the name", () => {
    expect(validateDisplayName("Rahul    Kumar")).toEqual({ ok: true, value: "Rahul Kumar" });
  });

  it("rejects an empty name", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("rejects a name that is only whitespace", () => {
    expect(validateDisplayName("     ")).toEqual({ ok: false, reason: "EMPTY" });
  });

  /**
   * The cases a plain `.trim()` silently lets through. Each of these arrives by accident —
   * pasted from a PDF, or produced by a keyboard — and each would otherwise be saved as a
   * "name" that looks blank on screen.
   */
  it.each([
    ["non-breaking space", "\u00A0\u00A0"],
    ["ideographic space", "\u3000"],
    ["zero-width space", "\u200B"],
    ["byte order mark", "\uFEFF"],
    ["left-to-right mark", "\u200E"],
    ["a tab and a newline", "\t\n"],
  ])("rejects a name made only of %s", (_label, input) => {
    expect(validateDisplayName(input)).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("strips an invisible character from inside an otherwise real name", () => {
    expect(validateDisplayName("Ve\u200Bnkatesh")).toEqual({ ok: true, value: "Venkatesh" });
  });

  it("treats a non-breaking space between two words as an ordinary space", () => {
    expect(normaliseDisplayName("Rahul\u00A0Kumar")).toBe("Rahul Kumar");
  });

  it("accepts a name in a non-Latin script", () => {
    expect(validateDisplayName("వెంకటేష్")).toEqual({ ok: true, value: "వెంకటేష్" });
  });

  it("accepts a name of exactly the maximum length", () => {
    const name = "a".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name });
  });

  it("rejects a name one character over the maximum", () => {
    expect(validateDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "TOO_LONG",
    });
  });

  /**
   * Counted in code points, not UTF-16 units. An emoji is two units and one character; charging
   * it as two would reject a name that visibly fits.
   */
  it("counts an astral character as one", () => {
    const name = "😀".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(validateDisplayName(name).ok).toBe(true);
  });

  it("measures after normalising, not before", () => {
    // 40 real characters, padded out past the limit with whitespace that will be trimmed.
    const padded = `          ${"a".repeat(DISPLAY_NAME_MAX_LENGTH)}          `;
    expect(validateDisplayName(padded).ok).toBe(true);
  });
});

describe("language", () => {
  it("offers exactly the languages that have a catalogue", () => {
    expect(supportedUiLanguages().sort()).toEqual(Object.keys(CATALOGUES).sort());
  });

  it("accepts every supported language", () => {
    for (const language of supportedUiLanguages()) {
      expect(validateLanguage(language)).toEqual({ ok: true, value: language });
    }
  });

  /**
   * Guards the one mistake this feature was most likely to make: offering the eight-language
   * picker the brief asked for, six of which have no catalogue and would show an English app.
   */
  it("rejects a language with no catalogue behind it", () => {
    for (const language of ["hi", "ta", "kn", "ml", "mr", "bn"]) {
      expect(validateLanguage(language)).toEqual({ ok: false, reason: "UNSUPPORTED" });
    }
  });

  it("rejects a non-string", () => {
    expect(validateLanguage(null)).toEqual({ ok: false, reason: "UNSUPPORTED" });
    expect(validateLanguage(7)).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });
});

describe("exam", () => {
  const available = ["SSC_CGL", "IBPS_PO"];

  it("accepts an exam this device actually has", () => {
    expect(validateExamCode("SSC_CGL", available)).toEqual({ ok: true, value: "SSC_CGL" });
  });

  it("rejects an exam that is not in the catalogue", () => {
    expect(validateExamCode("MADE_UP", available)).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });

  /** A first launch with no network has an empty catalogue; that is unavailable, not invalid. */
  it("accepts no exam at all", () => {
    expect(validateExamCode(null, [])).toEqual({ ok: true, value: null });
  });

  it("rejects any exam when the catalogue is empty", () => {
    expect(validateExamCode("SSC_CGL", [])).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });
});

describe("exam stage", () => {
  it("accepts a stage the selected exam has", () => {
    expect(validateExamStageId("stage-1", ["stage-1", "stage-2"])).toEqual({ ok: true, value: "stage-1" });
  });

  it("rejects a stage belonging to some other exam", () => {
    expect(validateExamStageId("stage-9", ["stage-1"])).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });

  /** An exam with no stages recorded never asks the question — null must stay valid. */
  it("accepts no stage", () => {
    expect(validateExamStageId(null, [])).toEqual({ ok: true, value: null });
  });
});

describe("target year", () => {
  it("offers the current year and the two after it", () => {
    expect(targetYearOptions(2026)).toEqual([2026, 2027, 2028]);
  });

  it("derives the options from the year it is asked in", () => {
    expect(targetYearOptions(2031)).toEqual([2031, 2032, 2033]);
  });

  it("accepts every offered option", () => {
    for (const year of targetYearOptions(2026)) {
      expect(validateTargetYear(year, 2026)).toEqual({ ok: true, value: year });
    }
  });

  it('accepts "not sure yet"', () => {
    expect(validateTargetYear(null, 2026)).toEqual({ ok: true, value: null });
  });

  it("rejects a year that has already passed", () => {
    expect(validateTargetYear(2025, 2026)).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
  });

  it("rejects a year beyond the horizon", () => {
    expect(validateTargetYear(2026 + TARGET_YEAR_HORIZON + 1, 2026)).toEqual({
      ok: false,
      reason: "OUT_OF_RANGE",
    });
  });

  it("rejects a non-integer year", () => {
    expect(validateTargetYear(2026.5, 2026)).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
    expect(validateTargetYear(Number.NaN, 2026)).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
  });
});

describe("preparation level and daily study time", () => {
  it("accepts the stated values", () => {
    expect(validatePreparationLevel("JUST_STARTING")).toEqual({ ok: true, value: "JUST_STARTING" });
    expect(validateDailyStudyTime("TWO_TO_FOUR")).toEqual({ ok: true, value: "TWO_TO_FOUR" });
  });

  it("rejects free text", () => {
    expect(validatePreparationLevel("just starting")).toEqual({ ok: false, reason: "UNSUPPORTED" });
    expect(validateDailyStudyTime("about 3 hours")).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });

  it("rejects null", () => {
    expect(validatePreparationLevel(null)).toEqual({ ok: false, reason: "UNSUPPORTED" });
    expect(validateDailyStudyTime(null)).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });
});

describe("content languages", () => {
  const available = ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn"];

  it("accepts one language", () => {
    expect(validateContentLanguages(["en"], available)).toEqual({ ok: true, value: ["en"] });
  });

  it("accepts two languages", () => {
    expect(validateContentLanguages(["en", "te"], available)).toEqual({ ok: true, value: ["en", "te"] });
  });

  it("rejects none when there is a list to choose from", () => {
    expect(validateContentLanguages([], available)).toEqual({ ok: false, reason: "EMPTY" });
  });

  /**
   * Regression guard for a real bug found on a device: with no synced `languages` table the step
   * offered nothing, yet still demanded a selection — so the student could not finish onboarding
   * at all. Nothing to choose from is UNAVAILABLE, not invalid, exactly as for the exam step.
   */
  it("accepts none when the catalogue itself is empty", () => {
    expect(validateContentLanguages([], [])).toEqual({ ok: true, value: [] });
  });

  it("still rejects an unsupported code against an empty catalogue only by ignoring it", () => {
    // With no catalogue there is nothing to validate against, so the selection is cleared rather
    // than rejected — the student is not blamed for data that never arrived.
    expect(validateContentLanguages(["en"], [])).toEqual({ ok: true, value: [] });
  });

  it("rejects three", () => {
    expect(validateContentLanguages(["en", "te", "hi"], available)).toEqual({ ok: false, reason: "TOO_MANY" });
  });

  it("rejects an unsupported code", () => {
    expect(validateContentLanguages(["en", "zz"], available)).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });

  /** Silently deduping would hide a caller whose selection state is already wrong. */
  it("rejects a duplicate rather than deduping it", () => {
    expect(validateContentLanguages(["en", "en"], available)).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });

  it("preserves the order chosen, so the first stays the default", () => {
    expect(validateContentLanguages(["te", "en"], available)).toEqual({ ok: true, value: ["te", "en"] });
  });

  /**
   * The content list and the interface list are different questions. Hindi has question content
   * but no UI catalogue, so it must be valid HERE and invalid for the interface — which is
   * exactly the conflation these two fields exist to prevent.
   */
  it("accepts a language that has content but no interface catalogue", () => {
    expect(validateContentLanguages(["hi"], available).ok).toBe(true);
    expect(validateLanguage("hi").ok).toBe(false);
  });
});

describe("toggling a content language at the limit", () => {
  it("adds when nothing is selected", () => {
    expect(toggleContentLanguage([], "en")).toEqual({ next: ["en"], refused: false });
  });

  it("adds a second", () => {
    expect(toggleContentLanguage(["en"], "te")).toEqual({ next: ["en", "te"], refused: false });
  });

  /**
   * The rule the brief is most specific about: a third tap is REFUSED, and the existing two are
   * left untouched. No auto-eviction — the student decides which one to give up.
   */
  it("refuses a third and changes nothing", () => {
    expect(toggleContentLanguage(["en", "te"], "hi")).toEqual({ next: ["en", "te"], refused: true });
  });

  it("allows deselecting", () => {
    expect(toggleContentLanguage(["en", "te"], "en")).toEqual({ next: ["te"], refused: false });
  });

  it("allows deselecting down to none, which Continue then blocks", () => {
    expect(toggleContentLanguage(["en"], "en")).toEqual({ next: [], refused: false });
  });

  it("lets a student swap the pair by deselecting first", () => {
    const afterRefusal = toggleContentLanguage(["en", "te"], "hi");
    expect(afterRefusal.refused).toBe(true);
    const afterRemove = toggleContentLanguage(afterRefusal.next, "te");
    expect(toggleContentLanguage(afterRemove.next, "hi")).toEqual({ next: ["en", "hi"], refused: false });
  });

  it("never mutates the array it was given", () => {
    const current = ["en", "te"];
    toggleContentLanguage(current, "hi");
    toggleContentLanguage(current, "en");
    expect(current).toEqual(["en", "te"]);
  });
});

describe("the whole draft", () => {
  const context = {
    availableContentLanguages: ["en", "hi", "te"],
    availableExamCodes: ["SSC_CGL", "IBPS_PO"],
    availableStageIds: ["stage-1", "stage-2"],
    currentYear: 2026,
  };

  function draft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
    return {
      displayName: "Venkatesh",
      preferredLanguage: "en",
      contentLanguages: ["en", "te"],
      primaryExamCode: "SSC_CGL",
      examStageId: "stage-1",
      targetYear: 2027,
      preparationLevel: "PRACTICING",
      dailyStudyTime: "TWO_TO_FOUR",
      ...overrides,
    };
  }

  it("passes a complete draft and returns it normalised", () => {
    const result = validateProfileDraft(draft({ displayName: "  Venkatesh  " }), context);
    expect(result).toEqual({
      ok: true,
      profile: {
        displayName: "Venkatesh",
        preferredLanguage: "en",
        contentLanguages: ["en", "te"],
        primaryExamCode: "SSC_CGL",
        examStageId: "stage-1",
        targetYear: 2027,
        preparationLevel: "PRACTICING",
        dailyStudyTime: "TWO_TO_FOUR",
      },
    });
  });

  it("passes a draft from an offline first launch, with no exam, stage or content language", () => {
    const result = validateProfileDraft(
      draft({ primaryExamCode: null, examStageId: null, targetYear: null, contentLanguages: [] }),
      { ...context, availableContentLanguages: [], availableExamCodes: [], availableStageIds: [] },
    );
    expect(result.ok).toBe(true);
  });

  it("reports every bad field at once, not just the first", () => {
    const result = validateProfileDraft(
      draft({ displayName: " ", primaryExamCode: "MADE_UP", preparationLevel: null }),
      context,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        displayName: "EMPTY",
        primaryExamCode: "UNSUPPORTED",
        preparationLevel: "UNSUPPORTED",
      },
    });
  });

  it("never returns a profile alongside errors", () => {
    const result = validateProfileDraft(draft({ displayName: "" }), context);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("profile");
  });
});
