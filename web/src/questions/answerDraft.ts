import { questionEvaluatorFor, type EvaluationOutcome } from "@sarkaritaiyaari/core/evaluation";

/**
 * One in-progress answer, in whichever shape its question type actually needs. Kept as a
 * single discriminated union (rather than six separate maps in the quiz screen) so the quiz
 * engine only ever holds one `Record<questionId, AnswerDraft>`. Shared between web's Practice
 * and Mock Test engines — not a mobile-shared module, since mobile organizes the same state as
 * six separate maps rather than one union.
 *
 * The "untouched" value for every collection-like kind is `null`, not an empty collection —
 * that distinction matters to the shared evaluator (see @sarkaritaiyaari/core/evaluation's
 * own comments): an empty-but-present MULTIPLE_CHOICE selection is a real, scoreable "ticked
 * nothing" answer, not a skip, so "never touched" has to be a different value than "touched
 * and then emptied".
 */
export type AnswerDraft =
  | { kind: "single"; index: number | null }
  | { kind: "boolean"; value: boolean | null }
  | { kind: "multi"; indices: number[] | null }
  | { kind: "text"; value: string }
  | { kind: "match"; mapping: Record<string, string> | null }
  | { kind: "order"; order: string[] | null };

const MULTI_TYPES = new Set(["MULTIPLE_CHOICE"]);
const TEXT_TYPES = new Set(["NUMERIC", "FILL_BLANK"]);

export function initialDraftFor(questionType: string): AnswerDraft {
  if (questionType === "TRUE_FALSE") return { kind: "boolean", value: null };
  if (MULTI_TYPES.has(questionType)) return { kind: "multi", indices: null };
  if (TEXT_TYPES.has(questionType)) return { kind: "text", value: "" };
  if (questionType === "MATCH") return { kind: "match", mapping: null };
  if (questionType === "ORDERING") return { kind: "order", order: null };
  // SINGLE_CHOICE, ASSERTION_REASON, STATEMENT_COMBINATION, and any future/unrecognised type
  // default to a single index — matches isIndexBasedType's own default.
  return { kind: "single", index: null };
}

/** Parses a numeric draft's raw text, treating blank or non-finite input as "not entered" rather than 0/NaN. */
function parsedNumeric(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Converts a draft into the JSON shape the shared evaluator expects for this question type. */
export function draftToResponse(questionType: string, draft: AnswerDraft): Record<string, unknown> {
  switch (draft.kind) {
    case "single":
      return { selectedOption: draft.index };
    case "boolean":
      return { selectedBoolean: draft.value };
    case "multi":
      return { selectedOptions: draft.indices };
    case "text":
      return questionType === "NUMERIC"
        ? { enteredValue: parsedNumeric(draft.value) }
        : { enteredText: draft.value.trim() === "" ? null : draft.value };
    case "match":
      return { mapping: draft.mapping };
    case "order":
      return { order: draft.order };
  }
}

export function isDraftAttempted(draft: AnswerDraft): boolean {
  switch (draft.kind) {
    case "single":
      return draft.index !== null;
    case "boolean":
      return draft.value !== null;
    case "multi":
      return draft.indices !== null;
    case "text":
      return draft.value.trim() !== "";
    case "match":
      return draft.mapping !== null && Object.keys(draft.mapping).length > 0;
    case "order":
      return draft.order !== null && draft.order.length > 0;
  }
}

/** Whether this type needs an explicit "Check answer" step rather than confirming on the first click. */
export function needsConfirmStep(questionType: string): boolean {
  return MULTI_TYPES.has(questionType) || TEXT_TYPES.has(questionType) || questionType === "MATCH" || questionType === "ORDERING";
}

/**
 * Scores one answered question — the single place both the Practice and Mock Test engines
 * must call, rather than dispatching to `questionEvaluatorFor` directly at the call site.
 *
 * SINGLE_CHOICE, ASSERTION_REASON and STATEMENT_COMBINATION are scored by a direct
 * `draft.index === correctIndex` comparison, NOT by routing through
 * `questionEvaluatorFor`'s SINGLE_CHOICE branch. That branch reads `answerKey.correctOption`,
 * a field older content synced before the multi-type architecture landed never populated —
 * `correctIndex` (resolved from the always-present `correctAnswer` string via
 * `resolveCorrectIndex`) is proven correct for every question in the bank. This mirrors
 * mobile's own `practice/quiz.tsx` and `mock-test/test.tsx`, which independently discovered
 * and documented the exact same requirement (TASK-2301 Phase P2 Wave A) — it is not a
 * hypothetical hedge, it is a previously-shipped, previously-necessary fix, kept here so a
 * fresh web engine cannot reintroduce it.
 *
 * Every other type has no such legacy content to be compatible with — the multi-type
 * architecture's own authoring validation has always required a real `answerKey` for them —
 * so the shared evaluator is the only, and correct, source of truth there.
 */
export function evaluateDraft(
  questionType: string,
  correctIndex: number | null,
  answerKey: Record<string, unknown> | null,
  contentStructure: Record<string, unknown> | null,
  draft: AnswerDraft,
): { outcome: EvaluationOutcome; scoreFraction: number } {
  if (draft.kind === "single") {
    if (draft.index === null) return { outcome: "UNATTEMPTED", scoreFraction: 0 };
    const correct = draft.index === correctIndex;
    return correct ? { outcome: "CORRECT", scoreFraction: 1 } : { outcome: "INCORRECT", scoreFraction: 0 };
  }
  const response = draftToResponse(questionType, draft);
  return questionEvaluatorFor(questionType)(answerKey, contentStructure, response);
}
