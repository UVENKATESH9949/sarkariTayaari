/**
 * The TypeScript mirror of backend/.../evaluation/{QuestionEvaluator,SingleChoiceEvaluator,
 * MultipleChoiceEvaluator,TrueFalseEvaluator,QuestionEvaluators}.java (TASK-2301). Two
 * copies on purpose — Practice and Mock Test work fully offline and fully signed out, so
 * evaluation has to run without a server — following the exact precedent this codebase
 * already set for the Weakness Radar's topic-health algorithm (see
 * intelligence/topicHealth.ts's own class comment).
 *
 * Lives in packages/core as of TASK-2601 Phase 0 so mobile/ and web/ share one copy rather
 * than becoming two mirrors of the same Java original. It was already dependency-free, which
 * is what made it the safest module to extract first.
 *
 * Wired into practice/quiz.tsx and mock-test/test.tsx as of Phase P2 Wave A — this is the
 * first phase where a question type genuinely needs it (MULTIPLE_CHOICE/TRUE_FALSE have no
 * single index for `db/answerResolution.ts`'s resolveCorrectIndex() to resolve).
 * SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION still go through
 * `questionEvaluatorFor("SINGLE_CHOICE")` uniformly, replacing the old direct
 * `chosen === question.correctIndex` comparison at those call sites — one evaluation path
 * for every type, not a special case for the original one.
 *
 * Phase P2 Wave B added `numericEvaluator`/`textAnswerEvaluator`/`mappingEvaluator`/
 * `sequenceEvaluator` for NUMERIC/FILL_BLANK/MATCH/ORDERING, mirroring
 * NumericEvaluator/TextAnswerEvaluator/MappingEvaluator/SequenceEvaluator.java exactly.
 *
 * Phase P4 added `manualEvaluator` for SHORT_ANSWER/LONG_ANSWER, mirroring
 * ManualEvaluator.java — schema/evaluator only, no student UI (see the task doc): neither
 * type is authorable server-side yet, so nothing actually dispatches here today.
 *
 * The shared correctness cases live in `sample-data/question-evaluator-fixtures.json`,
 * asserted on the Java side by QuestionEvaluatorsTest and — since TASK-2601 Phase 0 — on
 * this side by questionEvaluator.test.ts, which runs the same file through the same
 * dispatch. Before that this copy was genuinely untested and verified only by reading; that
 * is no longer true, so don't reintroduce the caveat.
 */

export type EvaluationOutcome = "CORRECT" | "INCORRECT" | "PARTIAL" | "UNATTEMPTED" | "PENDING_REVIEW";

export type EvaluationResult = {
  outcome: EvaluationOutcome;
  /** 0.0–1.0, so a future partial-credit family has somewhere to put a value other than 0 or 1. */
  scoreFraction: number;
};

/**
 * One function per evaluator family (OPTION_SET, NUMERIC, TEXT, MAPPING, SEQUENCE, MANUAL —
 * see `question_types.evaluator_family`, V25), matching the Java side's
 * `QuestionEvaluator` interface. `answerConfig` and `response` are both the same
 * loosely-typed shape as `answerKey` — a small per-type JSON object.
 */
export type QuestionEvaluator = (
  answerKey: Record<string, unknown> | null | undefined,
  answerConfig: Record<string, unknown> | null | undefined,
  response: Record<string, unknown> | null | undefined,
) => EvaluationResult;

/**
 * The OPTION_SET family's single-index member — mirrors SingleChoiceEvaluator.java exactly.
 * `response` is `{ selectedOption: number | null }`; a missing response object and a
 * present one whose `selectedOption` is null mean the same thing: nothing was answered.
 * Also covers ASSERTION_REASON and STATEMENT_COMBINATION — see questionEvaluatorFor below.
 */
export const singleChoiceEvaluator: QuestionEvaluator = (answerKey, _answerConfig, response) => {
  const selectedRaw = response?.selectedOption;
  if (selectedRaw === null || selectedRaw === undefined) {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  const selected = Number(selectedRaw);
  const correctRaw = answerKey?.correctOption;
  const correct = typeof correctRaw === "number" && selected === correctRaw;

  return correct ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
};

/**
 * The OPTION_SET family's set-equality member (Phase P2 Wave A). `answerKey` is
 * `{ correctOptions: number[] }`; `response` is `{ selectedOptions: number[] | null }` —
 * null means unattempted, an empty (but present) array means "submitted with nothing
 * ticked", a real, scoreable answer, not a skip. All-or-nothing, matching
 * MultipleChoiceEvaluator.java: a partially-correct selection scores 0, the same way these
 * real exams grade multi-select.
 */
export const multipleChoiceEvaluator: QuestionEvaluator = (answerKey, _answerConfig, response) => {
  const selectedRaw = response?.selectedOptions;
  if (selectedRaw === null || selectedRaw === undefined) {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  const selected = toIntSet(selectedRaw);
  const correct = toIntSet(answerKey?.correctOptions);
  const isCorrect = selected.size === correct.size && [...selected].every((v) => correct.has(v));

  return isCorrect ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
};

function toIntSet(raw: unknown): Set<number> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((v): v is number => typeof v === "number"));
}

/**
 * The OPTION_SET family's boolean member (Phase P2 Wave A). `answerKey` is
 * `{ correctBoolean: boolean }`; `response` is `{ selectedBoolean: boolean | null }`.
 */
export const trueFalseEvaluator: QuestionEvaluator = (answerKey, _answerConfig, response) => {
  const selectedRaw = response?.selectedBoolean;
  if (selectedRaw === null || selectedRaw === undefined) {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  const correctRaw = answerKey?.correctBoolean;
  const isCorrect = typeof correctRaw === "boolean" && selectedRaw === correctRaw;

  return isCorrect ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
};

/**
 * The NUMERIC evaluator family's sole member (Phase P2 Wave B). `answerKey` is
 * `{ correctValue: number, tolerance: number }` — `tolerance` is always present (defaulted
 * to 0 at write time by the backend, never guessed here); `response` is
 * `{ enteredValue: number | null }`.
 */
export const numericEvaluator: QuestionEvaluator = (answerKey, _answerConfig, response) => {
  const enteredRaw = response?.enteredValue;
  if (typeof enteredRaw !== "number") {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  const correctRaw = answerKey?.correctValue;
  if (typeof correctRaw !== "number") {
    return { outcome: "INCORRECT", scoreFraction: 0 };
  }
  const tolerance = typeof answerKey?.tolerance === "number" ? answerKey.tolerance : 0;

  const isCorrect = Math.abs(enteredRaw - correctRaw) <= tolerance;
  return isCorrect ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
};

/**
 * The TEXT evaluator family's sole member (Phase P2 Wave B), for FILL_BLANK. `answerKey`
 * is `{ acceptedAnswers: string[] }`; `response` is `{ enteredText: string | null }`.
 * Case-insensitive and whitespace-trimmed, matching TextAnswerEvaluator.java — a blank
 * (whitespace-only) entry counts as unattempted, not a wrong answer.
 */
export const textAnswerEvaluator: QuestionEvaluator = (answerKey, _answerConfig, response) => {
  const enteredRaw = response?.enteredText;
  if (typeof enteredRaw !== "string" || enteredRaw.trim().length === 0) {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  const accepted = answerKey?.acceptedAnswers;
  if (!Array.isArray(accepted)) {
    return { outcome: "INCORRECT", scoreFraction: 0 };
  }
  const normalizedEntered = enteredRaw.trim().toLowerCase();
  const isCorrect = accepted
    .filter((a): a is string => typeof a === "string")
    .some((a) => a.trim().toLowerCase() === normalizedEntered);

  return isCorrect ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
};

/**
 * The MAPPING evaluator family's sole member (Phase P2 Wave B), for MATCH. `answerKey` is
 * `{ correctMapping: { [leftKey]: rightKey } }`; `response` is
 * `{ mapping: { [leftKey]: rightKey } | null }`. All-or-nothing, like
 * multipleChoiceEvaluator — one wrong or missing pair scores 0.
 */
export const mappingEvaluator: QuestionEvaluator = (answerKey, _answerConfig, response) => {
  const mapping = response?.mapping;
  if (mapping === null || mapping === undefined || typeof mapping !== "object" || Object.keys(mapping).length === 0) {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  const correctMapping = answerKey?.correctMapping;
  if (correctMapping === null || correctMapping === undefined || typeof correctMapping !== "object") {
    return { outcome: "INCORRECT", scoreFraction: 0 };
  }

  const isCorrect = mapsAreEqual(mapping as Record<string, unknown>, correctMapping as Record<string, unknown>);
  return isCorrect ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
};

function mapsAreEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/**
 * The SEQUENCE evaluator family's sole member (Phase P2 Wave B), for ORDERING. `answerKey`
 * is `{ correctOrder: string[] }`; `response` is `{ order: string[] | null }`. Exact
 * sequence match — swapping two adjacent items scores 0.
 */
export const sequenceEvaluator: QuestionEvaluator = (answerKey, _answerConfig, response) => {
  const order = response?.order;
  if (!Array.isArray(order) || order.length === 0) {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  const correctOrder = answerKey?.correctOrder;
  if (!Array.isArray(correctOrder)) {
    return { outcome: "INCORRECT", scoreFraction: 0 };
  }

  const isCorrect = order.length === correctOrder.length && order.every((v, i) => v === correctOrder[i]);
  return isCorrect ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
};

/**
 * The MANUAL evaluator family's sole member (Phase P4), for SHORT_ANSWER/LONG_ANSWER —
 * mirrors ManualEvaluator.java exactly. `response` is `{ enteredText: string | null }`,
 * the same shape textAnswerEvaluator uses; `answerKey` is read by nobody here, since a
 * descriptive answer needs a human reader, not a comparison. An attempted answer always
 * evaluates to PENDING_REVIEW with a placeholder scoreFraction of 0 — not asserting
 * "wrong" the way INCORRECT would — awaiting a real score from a review workflow this
 * phase does not build. Nothing calls this yet: SHORT_ANSWER/LONG_ANSWER stay
 * `is_authoring_enabled = false` server-side, so no question of either type can exist to
 * be evaluated — this function exists so the mirror stays complete.
 */
export const manualEvaluator: QuestionEvaluator = (_answerKey, _answerConfig, response) => {
  const enteredRaw = response?.enteredText;
  if (typeof enteredRaw !== "string" || enteredRaw.trim().length === 0) {
    return { outcome: "UNATTEMPTED", scoreFraction: 0 };
  }

  return { outcome: "PENDING_REVIEW", scoreFraction: 0 };
};

/**
 * Dispatches a question type to its evaluator — mirrors QuestionEvaluators.java. Eleven
 * types, eight functions: ASSERTION_REASON and STATEMENT_COMBINATION reuse
 * singleChoiceEvaluator unchanged, since both are single-correct-option answers under the
 * hood and only their authored content differs (the architecture proposal's "two of the
 * nine 'new' types need no new evaluator" point); SHORT_ANSWER reuses manualEvaluator,
 * since it and LONG_ANSWER are both free-text answers a human has to grade.
 */
export function questionEvaluatorFor(questionType: string | null | undefined): QuestionEvaluator {
  switch (questionType) {
    case "MULTIPLE_CHOICE":
      return multipleChoiceEvaluator;
    case "TRUE_FALSE":
      return trueFalseEvaluator;
    case "NUMERIC":
      return numericEvaluator;
    case "FILL_BLANK":
      return textAnswerEvaluator;
    case "MATCH":
      return mappingEvaluator;
    case "ORDERING":
      return sequenceEvaluator;
    case "LONG_ANSWER":
    case "SHORT_ANSWER":
      return manualEvaluator;
    case "SINGLE_CHOICE":
    case "ASSERTION_REASON":
    case "STATEMENT_COMBINATION":
    default:
      // Undefined/unrecognised falls back to single-choice rather than throwing — every
      // question synced from a backend that predates this phase is SINGLE_CHOICE by
      // construction (P1's own backfill), so this is the correct default, not a shrug.
      return singleChoiceEvaluator;
  }
}
