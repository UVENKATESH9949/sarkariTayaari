import type { Question } from "./types";

/**
 * Renders a response as review text — "Your answer" / "Correct answer" — for the Summary
 * screen. Unlike mobile's `questionRenderer/answerSummary.ts`, this runs against the full,
 * just-fetched `Question` (translations, contentStructure, answerKey all present),
 * not a denormalised stored-result snapshot read back later — so it can show a real correct
 * answer for every type, including MULTIPLE_CHOICE/TRUE_FALSE and real MATCH/ORDERING labels,
 * which mobile's equivalent deliberately can't (see that file's own comment on why). That
 * limitation reappears once web has its own persisted-history screen in Phase 3, working from
 * a restored session rather than a live question — this file is not it.
 */

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function describeYourAnswer(question: Question, response: Record<string, unknown> | null, languageCode: string): string {
  const options = question.translations[languageCode]?.options ?? Object.values(question.translations)[0]?.options ?? [];
  const translation = question.translations[languageCode] ?? Object.values(question.translations)[0];

  switch (question.questionType) {
    case "MULTIPLE_CHOICE": {
      const selected = Array.isArray(response?.selectedOptions) ? (response!.selectedOptions as number[]) : null;
      if (!selected || selected.length === 0) return "Not answered";
      return selected.map((i) => `${letter(i)}. ${options[i] ?? ""}`).join(", ");
    }
    case "TRUE_FALSE": {
      const selected = response?.selectedBoolean;
      if (typeof selected !== "boolean") return "Not answered";
      return selected ? "True" : "False";
    }
    case "NUMERIC": {
      const entered = response?.enteredValue;
      return typeof entered === "number" ? String(entered) : "Not answered";
    }
    case "FILL_BLANK": {
      const entered = response?.enteredText;
      return typeof entered === "string" && entered.trim() !== "" ? entered : "Not answered";
    }
    case "MATCH": {
      const mapping = response?.mapping as Record<string, string> | null | undefined;
      if (!mapping || Object.keys(mapping).length === 0) return "Not answered";
      const leftLabels = (translation?.content?.leftLabels as Record<string, string> | undefined) ?? {};
      const rightLabels = (translation?.content?.rightLabels as Record<string, string> | undefined) ?? {};
      return Object.entries(mapping)
        .map(([l, r]) => `${leftLabels[l] ?? l} → ${rightLabels[r] ?? r}`)
        .join(", ");
    }
    case "ORDERING": {
      const order = response?.order as string[] | null | undefined;
      if (!order || order.length === 0) return "Not answered";
      const itemLabels = (translation?.content?.itemLabels as Record<string, string> | undefined) ?? {};
      return order.map((key) => itemLabels[key] ?? key).join(" → ");
    }
    default: {
      const selected = response?.selectedOption;
      if (typeof selected !== "number") return "Not answered";
      return `${letter(selected)}. ${options[selected] ?? ""}`;
    }
  }
}

export function describeCorrectAnswer(question: Question, languageCode: string): string {
  const options = question.translations[languageCode]?.options ?? Object.values(question.translations)[0]?.options ?? [];
  const translation = question.translations[languageCode] ?? Object.values(question.translations)[0];
  const answerKey = question.answerKey ?? {};

  switch (question.questionType) {
    case "MULTIPLE_CHOICE": {
      const correct = Array.isArray(answerKey.correctOptions) ? (answerKey.correctOptions as number[]) : [];
      return correct.map((i) => `${letter(i)}. ${options[i] ?? ""}`).join(", ");
    }
    case "TRUE_FALSE":
      return answerKey.correctBoolean ? "True" : "False";
    case "NUMERIC": {
      const value = answerKey.correctValue;
      const tolerance = answerKey.tolerance;
      return typeof value === "number" ? `${value}${typeof tolerance === "number" && tolerance > 0 ? ` (± ${tolerance})` : ""}` : "—";
    }
    case "FILL_BLANK": {
      const accepted = Array.isArray(answerKey.acceptedAnswers) ? (answerKey.acceptedAnswers as string[]) : [];
      return accepted[0] ?? "—";
    }
    case "MATCH": {
      const mapping = (answerKey.correctMapping as Record<string, string> | undefined) ?? {};
      const leftLabels = (translation?.content?.leftLabels as Record<string, string> | undefined) ?? {};
      const rightLabels = (translation?.content?.rightLabels as Record<string, string> | undefined) ?? {};
      return Object.entries(mapping)
        .map(([l, r]) => `${leftLabels[l] ?? l} → ${rightLabels[r] ?? r}`)
        .join(", ");
    }
    case "ORDERING": {
      const order = Array.isArray(answerKey.correctOrder) ? (answerKey.correctOrder as string[]) : [];
      const itemLabels = (translation?.content?.itemLabels as Record<string, string> | undefined) ?? {};
      return order.map((key) => itemLabels[key] ?? key).join(" → ");
    }
    default:
      return question.correctIndex !== null ? `${letter(question.correctIndex)}. ${options[question.correctIndex] ?? ""}` : "—";
  }
}
