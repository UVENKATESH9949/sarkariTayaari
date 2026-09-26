/**
 * Validation of AI output, before a student ever sees it (`AI_ARCHITECTURE.md` §8).
 *
 * This is the layer that makes "the model never states the answer" enforceable rather than
 * aspirational. The correct answer is verified data the app already holds; the model is given it
 * and asked to reason about it. So an explanation claiming a *different* answer is not a
 * judgement call about quality — it is a mechanical mismatch against known-good data, and it is
 * rejected. That single check removes the worst failure mode in exam prep at near-zero cost.
 *
 * Everything here is a pure function over already-parsed values. Nothing throws: a bad response
 * is a value (`{ ok: false, ... }`), because the caller's job on failure is to fall down the
 * tier ladder, not to crash a screen that already has correct content on it (the brief's §22 —
 * "never crash the application because the model generated malformed output").
 */

import type { QuestionContext } from "../context/types";
import type {
  AiTaskResponse,
  GenerativeTaskId,
  MistakeType,
  ResponseForTask,
  WrongOptionNote,
} from "./types";
import { MISTAKE_TYPES, isRecommendedResultAction } from "./types";

export type ValidationFailureCode =
  | "NOT_JSON"
  | "NOT_AN_OBJECT"
  | "WRONG_TASK"
  | "MISSING_FIELD"
  | "EMPTY_FIELD"
  | "WRONG_TYPE"
  | "UNKNOWN_ENUM"
  | "OUT_OF_RANGE"
  /** The model explained an answer other than the verified one. The check this file exists for. */
  | "UNGROUNDED_ANSWER"
  /** A hint that gives the answer away is not a hint. */
  | "HINT_REVEALS_ANSWER"
  /** A session/profile narrative cited a number it was not given, or named no real topic. */
  | "UNGROUNDED_NARRATIVE";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ValidationFailureCode; detail: string };

/** What a response is checked against. */
export type Grounding = {
  question?: QuestionContext;
  /** Present only for `SESSION_FEEDBACK`/`PROFILE_SUMMARY` — see `groundedNarrative`. */
  narrative?: NarrativeGrounding;
};

/* ------------------------------------------------------------------------------- JSON parsing */

/**
 * Parses a model's raw text into a value.
 *
 * Tolerates a fenced code block, because instruction-tuned models wrap JSON in ```json far more
 * often than prompt wording alone prevents — and a response that is correct apart from three
 * backticks is not worth discarding and re-billing for. Nothing beyond that is repaired: silent
 * coercion of genuinely malformed output is how bad data reaches a cache.
 */
export function parseAiJson(raw: string): ValidationResult<unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  if (candidate.length === 0) {
    return { ok: false, code: "NOT_JSON", detail: "response was empty" };
  }

  try {
    return { ok: true, value: JSON.parse(candidate) as unknown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unparseable";
    return { ok: false, code: "NOT_JSON", detail: reason };
  }
}

/* ---------------------------------------------------------------------------------- grounding */

/** Trim, lowercase, collapse internal whitespace. Enough to survive formatting, not meaning. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strips a leading option label — `A)`, `(B)`, `C.`, `D -` — that models add unprompted. */
function stripOptionLabel(value: string): string {
  return value.replace(/^\s*\(?\s*[a-d]\s*\)?\s*[.):\-—]\s*/i, "").trim();
}

/**
 * Resolves an answer that is written as an option letter into the option's actual text.
 *
 * Needed in both directions: this codebase stores `correct_answer` as a letter for legacy
 * single-choice rows and as display text for others (it was widened from `VARCHAR(10)` to
 * `VARCHAR(500)` in V28 precisely because of that), while a model may echo either. Comparing
 * "B" to "Kolkata" would otherwise fail a perfectly correct answer.
 */
function resolveToOptionText(value: string, options: readonly string[]): string {
  const trimmed = value.trim();
  if (!/^\(?[a-dA-D]\)?$/.test(trimmed)) return trimmed;

  const index = trimmed.replace(/[()]/g, "").toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < options.length ? options[index] : trimmed;
}

/**
 * Whether the model's claimed answer is the verified one.
 *
 * Generous about *form* (labels, casing, letter-vs-text) and strict about *substance*. Being
 * lenient here would defeat the check; being pedantic would reject correct answers over a stray
 * "B) ", and a validator that cries wolf gets switched off.
 */
export function answerMatches(
  claimed: string,
  correctAnswer: string,
  options: readonly string[],
): boolean {
  const claimedForms = new Set([
    normalise(claimed),
    normalise(stripOptionLabel(claimed)),
    normalise(resolveToOptionText(claimed, options)),
    normalise(resolveToOptionText(stripOptionLabel(claimed), options)),
  ]);

  const correctForms = [
    normalise(correctAnswer),
    normalise(stripOptionLabel(correctAnswer)),
    normalise(resolveToOptionText(correctAnswer, options)),
  ];

  return correctForms.some((form) => form.length > 0 && claimedForms.has(form));
}

/**
 * Whether a hint gives the answer away.
 *
 * Only checks tokens of three characters or more. A numeric answer like "5" or "12" appears
 * inside legitimate hints constantly ("divide by 12 first"), so matching short tokens would
 * reject good hints far more often than it caught bad ones — and the cost of a false reject here
 * is a wasted generation, not a wrong answer. Long-token leakage is the case worth catching.
 */
export function hintRevealsAnswer(
  hint: string,
  correctAnswer: string,
  options: readonly string[],
): boolean {
  const answerText = normalise(resolveToOptionText(correctAnswer, options));
  if (answerText.length < 3) return false;

  const haystack = normalise(hint);
  const escaped = answerText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(haystack);
}

/**
 * What a `SESSION_FEEDBACK`/`PROFILE_SUMMARY` narrative is checked against — every number and
 * topic name the model was actually handed in its context. The caller builds this from the same
 * `SessionContext`/`LearnerProfileContext` the prompt itself was built from, so grounding checks
 * the model against exactly what it was given, never a re-derived version of it.
 */
export type NarrativeGrounding = {
  allowedNumbers: readonly number[];
  allowedTopicNames: readonly string[];
};

/**
 * Whether a session/profile narrative only cites numbers it was actually given.
 *
 * Extracts every standalone numeric token (whole numbers, decimals, percentages) from the
 * narrative and checks each is traceable to `allowedNumbers` — the same "mechanical equality
 * check, not a judgement call" posture `answerMatches` already established for question
 * explanations.
 *
 * This does **not** attempt full topic-name hallucination-proofing — reliably detecting an
 * invented multi-word topic name inside free-form prose needs more than a mechanical check can
 * promise, the same honest scoping `hintRevealsAnswer`'s own doc comment already applies to
 * itself. It instead asserts the narrative actually engages with the real data it was given: at
 * least one of the supplied topic names must appear somewhere in it (when any were supplied), so
 * a generic, content-free narrative fails the same way an empty explanation would.
 */
export function groundedNarrative(
  narrative: string,
  grounding: NarrativeGrounding,
): ValidationResult<true> {
  const allowed = new Set(grounding.allowedNumbers.map((n) => Math.round(n).toString()));

  const tokens = narrative.match(/\d+(\.\d+)?/g) ?? [];
  for (const token of tokens) {
    const rounded = Math.round(parseFloat(token)).toString();
    if (!allowed.has(rounded)) {
      return fail(
        "UNGROUNDED_NARRATIVE",
        `narrative cites "${token}", which was not among the given facts`,
      );
    }
  }

  if (grounding.allowedTopicNames.length > 0) {
    const normalisedNarrative = normalise(narrative);
    const mentionsAKnownTopic = grounding.allowedTopicNames.some((name) =>
      normalisedNarrative.includes(normalise(name)),
    );
    if (!mentionsAKnownTopic) {
      return fail("UNGROUNDED_NARRATIVE", "narrative names none of the topics it was given");
    }
  }

  return { ok: true, value: true };
}

/* --------------------------------------------------------------------------- field helpers */

function fail<T>(code: ValidationFailureCode, detail: string): ValidationResult<T> {
  return { ok: false, code, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Required non-empty string. */
function str(
  source: Record<string, unknown>,
  field: string,
): ValidationResult<string> {
  const value = source[field];
  if (value === undefined || value === null) return fail("MISSING_FIELD", field);
  if (typeof value !== "string") return fail("WRONG_TYPE", `${field} must be a string`);
  if (value.trim().length === 0) return fail("EMPTY_FIELD", field);
  return { ok: true, value: value.trim() };
}

/** Optional string; absent, null and blank all normalise to null. */
function optionalStr(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Array of non-empty strings — the `strengths`/`weakAreas` bullet lists. Absent/null means "none". */
function strArray(source: Record<string, unknown>, field: string): ValidationResult<string[]> {
  const value = source[field];
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail("WRONG_TYPE", `${field} must be an array`);

  const items: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string") return fail("WRONG_TYPE", `${field}[${index}] must be a string`);
    const trimmed = entry.trim();
    if (trimmed.length > 0) items.push(trimmed);
  }
  return { ok: true, value: items };
}

function wrongOptionNotes(value: unknown): ValidationResult<WrongOptionNote[]> {
  // Absent is tolerated — a True/False question has little to say here, and an empty list is a
  // weaker answer rather than an invalid one.
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail("WRONG_TYPE", "whyOthersWrong must be an array");

  const notes: WrongOptionNote[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) return fail("WRONG_TYPE", `whyOthersWrong[${index}] must be an object`);
    const option = str(entry, "option");
    if (!option.ok) return fail(option.code, `whyOthersWrong[${index}].${option.detail}`);
    const why = str(entry, "why");
    if (!why.ok) return fail(why.code, `whyOthersWrong[${index}].${why.detail}`);
    notes.push({ option: option.value, why: why.value });
  }
  return { ok: true, value: notes };
}

/* -------------------------------------------------------------------------------- validation */

/**
 * Validates one response against its task and the verified data behind it.
 *
 * The `taskId` argument is authoritative; a payload disagreeing with it is rejected rather than
 * re-routed, because the caller asked for a specific task and silently returning another one
 * would render under the wrong heading.
 */
export function validateAiResponse<T extends GenerativeTaskId>(
  taskId: T,
  raw: unknown,
  grounding: Grounding = {},
): ValidationResult<ResponseForTask<T>> {
  if (!isRecord(raw)) {
    return fail("NOT_AN_OBJECT", `expected an object, got ${raw === null ? "null" : typeof raw}`);
  }
  if (raw.taskId !== taskId) {
    return fail("WRONG_TASK", `expected taskId "${taskId}", got ${JSON.stringify(raw.taskId)}`);
  }

  const built = buildResponse(taskId, raw, grounding);
  if (!built.ok) return built as ValidationResult<ResponseForTask<T>>;
  return { ok: true, value: built.value as ResponseForTask<T> };
}

function buildResponse(
  taskId: GenerativeTaskId,
  raw: Record<string, unknown>,
  grounding: Grounding,
): ValidationResult<AiTaskResponse> {
  switch (taskId) {
    case "QUESTION_EXPLANATION": {
      const answer = str(raw, "answer");
      if (!answer.ok) return answer;
      const whyCorrect = str(raw, "whyCorrect");
      if (!whyCorrect.ok) return whyCorrect;
      const notes = wrongOptionNotes(raw.whyOthersWrong);
      if (!notes.ok) return notes;

      const grounded = checkAnswerGrounding(answer.value, grounding);
      if (!grounded.ok) return grounded;

      return {
        ok: true,
        value: {
          taskId: "QUESTION_EXPLANATION",
          answer: answer.value,
          whyCorrect: whyCorrect.value,
          whyOthersWrong: notes.value,
          concept: optionalStr(raw, "concept"),
          examTip: optionalStr(raw, "examTip"),
        },
      };
    }

    case "QUESTION_HINT": {
      const hint = str(raw, "hint");
      if (!hint.ok) return hint;

      const question = grounding.question;
      if (question && hintRevealsAnswer(hint.value, question.correctAnswer, question.options)) {
        return fail("HINT_REVEALS_ANSWER", "hint contains the correct answer");
      }

      return { ok: true, value: { taskId: "QUESTION_HINT", hint: hint.value } };
    }

    case "CONCEPT_EXPLANATION": {
      const concept = str(raw, "concept");
      if (!concept.ok) return concept;
      const explanation = str(raw, "explanation");
      if (!explanation.ok) return explanation;

      return {
        ok: true,
        value: {
          taskId: "CONCEPT_EXPLANATION",
          concept: concept.value,
          explanation: explanation.value,
          examTip: optionalStr(raw, "examTip"),
        },
      };
    }

    case "MISTAKE_ANALYSIS": {
      const mistakeType = str(raw, "mistakeType");
      if (!mistakeType.ok) return mistakeType;
      if (!(MISTAKE_TYPES as readonly string[]).includes(mistakeType.value)) {
        return fail("UNKNOWN_ENUM", `mistakeType "${mistakeType.value}" is not in the taxonomy`);
      }
      const explanation = str(raw, "explanation");
      if (!explanation.ok) return explanation;
      const suggestedAction = str(raw, "suggestedAction");
      if (!suggestedAction.ok) return suggestedAction;

      return {
        ok: true,
        value: {
          taskId: "MISTAKE_ANALYSIS",
          mistakeType: mistakeType.value as MistakeType,
          explanation: explanation.value,
          suggestedAction: suggestedAction.value,
        },
      };
    }

    case "PERSONALIZED_EXPLANATION": {
      const answer = str(raw, "answer");
      if (!answer.ok) return answer;
      const explanation = str(raw, "explanation");
      if (!explanation.ok) return explanation;
      const pitchedFor = str(raw, "pitchedFor");
      if (!pitchedFor.ok) return pitchedFor;

      const grounded = checkAnswerGrounding(answer.value, grounding);
      if (!grounded.ok) return grounded;

      return {
        ok: true,
        value: {
          taskId: "PERSONALIZED_EXPLANATION",
          answer: answer.value,
          explanation: explanation.value,
          pitchedFor: pitchedFor.value,
        },
      };
    }

    case "QUESTION_CLASSIFICATION": {
      const suggestedTopicName = str(raw, "suggestedTopicName");
      if (!suggestedTopicName.ok) return suggestedTopicName;
      const suggestedDifficultyCode = str(raw, "suggestedDifficultyCode");
      if (!suggestedDifficultyCode.ok) return suggestedDifficultyCode;

      const confidence = raw.confidence;
      if (typeof confidence !== "number" || Number.isNaN(confidence)) {
        return fail("WRONG_TYPE", "confidence must be a number");
      }
      if (confidence < 0 || confidence > 1) {
        return fail("OUT_OF_RANGE", `confidence must be between 0 and 1, got ${confidence}`);
      }

      return {
        ok: true,
        value: {
          taskId: "QUESTION_CLASSIFICATION",
          suggestedTopicName: suggestedTopicName.value,
          suggestedDifficultyCode: suggestedDifficultyCode.value,
          confidence,
        },
      };
    }

    case "SESSION_FEEDBACK": {
      const narrative = str(raw, "narrative");
      if (!narrative.ok) return narrative;

      const grounded = checkNarrativeGrounding(narrative.value, grounding);
      if (!grounded.ok) return grounded;

      return { ok: true, value: { taskId: "SESSION_FEEDBACK", narrative: narrative.value } };
    }

    case "PROFILE_SUMMARY": {
      const narrative = str(raw, "narrative");
      if (!narrative.ok) return narrative;

      const grounded = checkNarrativeGrounding(narrative.value, grounding);
      if (!grounded.ok) return grounded;

      return { ok: true, value: { taskId: "PROFILE_SUMMARY", narrative: narrative.value } };
    }

    case "PRACTICE_RESULT_INSIGHT": {
      const summary = str(raw, "summary");
      if (!summary.ok) return summary;
      const strengths = strArray(raw, "strengths");
      if (!strengths.ok) return strengths;
      const weakAreas = strArray(raw, "weakAreas");
      if (!weakAreas.ok) return weakAreas;
      const timeInsight = optionalStr(raw, "timeInsight");
      const recommendation = str(raw, "recommendation");
      if (!recommendation.ok) return recommendation;
      const recommendedAction = str(raw, "recommendedAction");
      if (!recommendedAction.ok) return recommendedAction;
      if (!isRecommendedResultAction(recommendedAction.value)) {
        return fail("UNKNOWN_ENUM", `recommendedAction "${recommendedAction.value}" is not one of the allowed actions`);
      }

      // Topic-name grounding only — deliberately NOT the strict numeric check `groundedNarrative`
      // applies to SESSION_FEEDBACK/PROFILE_SUMMARY. This task's `recommendation` legitimately
      // invents a practice-count ("10-15 questions") that is an action item, not a claimed
      // statistic about the student, so a numeric check here would reject the exact wording the
      // product spec asks for.
      const combinedText = [summary.value, ...strengths.value, ...weakAreas.value, timeInsight ?? "", recommendation.value].join(" ");
      const grounded = checkTopicNameGrounding(combinedText, grounding);
      if (!grounded.ok) return grounded;

      return {
        ok: true,
        value: {
          taskId: "PRACTICE_RESULT_INSIGHT",
          summary: summary.value,
          strengths: strengths.value.slice(0, 3),
          weakAreas: weakAreas.value.slice(0, 3),
          timeInsight,
          recommendation: recommendation.value,
          recommendedAction: recommendedAction.value,
        },
      };
    }
  }
}

/**
 * Grounding is skipped when no question was supplied rather than failing.
 *
 * That is deliberate and worth stating: the same validator runs in contexts that legitimately
 * have no question to check against (an admin previewing a generated row, a unit test of shape
 * alone). The router always supplies grounding for a question task, so the check runs where it
 * matters; making absence an error here would only push callers into passing a fake question.
 */
function checkAnswerGrounding(
  claimed: string,
  grounding: Grounding,
): ValidationResult<true> {
  const question = grounding.question;
  if (!question) return { ok: true, value: true };

  if (!answerMatches(claimed, question.correctAnswer, question.options)) {
    return fail(
      "UNGROUNDED_ANSWER",
      `model answered ${JSON.stringify(claimed)} but the verified answer is ${JSON.stringify(question.correctAnswer)}`,
    );
  }
  return { ok: true, value: true };
}

/**
 * Same "skip rather than fail when the caller supplied nothing to check against" posture as
 * `checkAnswerGrounding` above, and for the identical reason — this validator also runs in
 * contexts with nothing to ground against (a unit test of shape alone). The router always
 * supplies `narrative` grounding for these two tasks, so the check runs where it matters.
 */
function checkNarrativeGrounding(narrative: string, grounding: Grounding): ValidationResult<true> {
  if (!grounding.narrative) return { ok: true, value: true };
  return groundedNarrative(narrative, grounding.narrative);
}

/**
 * `PRACTICE_RESULT_INSIGHT`'s own, lighter grounding check — topic names only, never numbers.
 * See the case block's own comment for why a numeric check does not fit this task's shape.
 */
function checkTopicNameGrounding(combinedText: string, grounding: Grounding): ValidationResult<true> {
  const allowedTopicNames = grounding.narrative?.allowedTopicNames ?? [];
  if (allowedTopicNames.length === 0) return { ok: true, value: true };

  const normalised = normalise(combinedText);
  const mentionsAKnownTopic = allowedTopicNames.some((name) => normalised.includes(normalise(name)));
  if (!mentionsAKnownTopic) {
    return fail("UNGROUNDED_NARRATIVE", "response names none of the sub-topics it was given");
  }
  return { ok: true, value: true };
}
