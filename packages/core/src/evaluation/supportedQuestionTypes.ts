/**
 * Every question type this build's renderer/evaluator (questionRenderer/, evaluation/
 * questionEvaluator.ts) actually knows how to show and score — declared on every sync/live
 * call so the server's capability negotiation (TASK-2301 Phase P3, backend V29) knows this is
 * not a pre-negotiation client. Kept as one list rather than hand-typed at each call site so
 * adding a type here is the only change needed to start receiving it.
 */
export const SUPPORTED_QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "ASSERTION_REASON",
  "STATEMENT_COMBINATION",
  "NUMERIC",
  "FILL_BLANK",
  "MATCH",
  "ORDERING",
] as const;

export const SUPPORTED_QUESTION_TYPES_PARAM = SUPPORTED_QUESTION_TYPES.join(",");
