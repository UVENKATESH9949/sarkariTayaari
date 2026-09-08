/**
 * Renders a stored practice/mock result's answer as text for the read-only review
 * screens (summary.tsx, mock-test/result.tsx) — the one place that has to speak all
 * five question types from a single `QuestionResult`/`MockTestResultItem` shape
 * (TASK-2301 Phase P2 Wave A).
 */
export type AnswerSummaryResult = {
  questionType?: string | null;
  options: string[];
  selectedIndex: number | null;
  correctIndex: number | null;
  response?: Record<string, unknown> | null;
};

export type AnswerLabels = {
  trueOption: string;
  falseOption: string;
  unattempted: string;
};

export function describeYourAnswer(result: AnswerSummaryResult, labels: AnswerLabels): string {
  const type = result.questionType ?? "SINGLE_CHOICE";

  if (type === "MULTIPLE_CHOICE") {
    const selected = Array.isArray(result.response?.selectedOptions)
      ? (result.response!.selectedOptions as unknown[]).filter((v): v is number => typeof v === "number")
      : null;
    if (selected === null || selected.length === 0) return labels.unattempted;
    return selected.map((i) => `${String.fromCharCode(65 + i)}. ${result.options[i] ?? ""}`).join(", ");
  }

  if (type === "TRUE_FALSE") {
    const selected = result.response?.selectedBoolean;
    if (typeof selected !== "boolean") return labels.unattempted;
    return selected ? labels.trueOption : labels.falseOption;
  }

  if (type === "NUMERIC") {
    const entered = result.response?.enteredValue;
    if (typeof entered !== "number") return labels.unattempted;
    return String(entered);
  }

  if (type === "FILL_BLANK") {
    const entered = result.response?.enteredText;
    if (typeof entered !== "string" || entered.trim().length === 0) return labels.unattempted;
    return entered;
  }

  if (type === "MATCH") {
    const mapping = result.response?.mapping;
    if (mapping === null || mapping === undefined || typeof mapping !== "object" || Object.keys(mapping).length === 0) {
      return labels.unattempted;
    }
    // No per-language labels are available in a stored result snapshot (same limitation as
    // MULTIPLE_CHOICE/TRUE_FALSE below) — a pair count is honest, a guessed label isn't.
    return `${Object.keys(mapping).length} pair(s) matched`;
  }

  if (type === "ORDERING") {
    const order = result.response?.order;
    if (!Array.isArray(order) || order.length === 0) return labels.unattempted;
    return `${order.length} item(s) ordered`;
  }

  if (result.selectedIndex === null || result.selectedIndex === undefined) return labels.unattempted;
  return `${String.fromCharCode(65 + result.selectedIndex)}. ${result.options[result.selectedIndex] ?? ""}`;
}

/**
 * `null` when the correct value can't be shown — not an error state. MULTIPLE_CHOICE and
 * TRUE_FALSE results store only `response`/`outcome`, never the answer key (matching the
 * backend's result tables, which have no such column either): whether the pick was right
 * is known, the specific correct option/value isn't reconstructable from a stored result
 * without a live question lookup, which review screens deliberately don't do (they read
 * denormalised snapshots, same as every other type already did before this phase).
 */
export function describeCorrectAnswer(result: AnswerSummaryResult, labels: AnswerLabels): string | null {
  const type = result.questionType ?? "SINGLE_CHOICE";
  if (type === "MULTIPLE_CHOICE" || type === "TRUE_FALSE") return null;
  if (result.correctIndex === null || result.correctIndex === undefined) return null;
  return `${String.fromCharCode(65 + result.correctIndex)}. ${result.options[result.correctIndex] ?? ""}`;
}
