import { OptionList } from "./renderers/OptionList";
import { MultiSelectOptionList } from "./renderers/MultiSelectOptionList";
import { FreeTextInput } from "./renderers/FreeTextInput";
import { MatchPairing, type MatchItem } from "./renderers/MatchPairing";
import { OrderingBuilder, type OrderingItem } from "./renderers/OrderingBuilder";
import { ContentPreamble } from "./renderers/ContentPreamble";
import { GroupContent } from "./renderers/GroupContent";
import type { AnswerDraft } from "./answerDraft";
import type { Question, QuestionGroup } from "./types";
import type { EvaluationOutcome } from "@sarkaritaiyaari/core/evaluation";

function shuffleStable<T>(items: T[], seed: string): T[] {
  // A deterministic shuffle keyed on the question's own id, so the right column doesn't
  // re-shuffle on every keystroke/re-render — only when the question actually changes.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Renders one question's answer area for whichever type it is, and — once `revealed` —
 * its correct/incorrect styling. State lives one level up in the quiz engine (a single
 * `Record<questionId, AnswerDraft>`); this component only translates that draft to and from
 * each renderer's own props.
 */
export function QuestionBody({
  question,
  group,
  languageCode,
  draft,
  onChange,
  revealed,
  outcome,
}: {
  question: Question;
  group: QuestionGroup | null | undefined;
  languageCode: string;
  draft: AnswerDraft;
  /** Absent = read-only (already revealed / review mode). */
  onChange?: (draft: AnswerDraft) => void;
  revealed: boolean;
  /** The evaluated outcome, once revealed — only FreeTextInput needs it (it has no per-character reveal). */
  outcome?: EvaluationOutcome;
}) {
  const translation = question.translations[languageCode] ?? Object.values(question.translations)[0];
  const disabled = !onChange || revealed;

  return (
    <div>
      <GroupContent group={group} languageCode={languageCode} />
      <ContentPreamble questionType={question.questionType} content={translation?.content} />
      {renderAnswerArea()}
    </div>
  );

  function renderAnswerArea() {
    if (draft.kind === "boolean") {
      const correctIndex = revealed
        ? (question.answerKey?.correctBoolean as boolean | undefined)
          ? 0
          : 1
        : undefined;
      return (
        <OptionList
          name={question.id}
          options={["True", "False"]}
          selectedIndex={draft.value === null ? null : draft.value ? 0 : 1}
          onSelect={onChange && !disabled ? (index) => onChange({ kind: "boolean", value: index === 0 }) : undefined}
          correctIndex={correctIndex}
          disabled={disabled}
        />
      );
    }

    if (draft.kind === "single") {
      return (
        <OptionList
          name={question.id}
          options={translation?.options ?? []}
          selectedIndex={draft.index}
          onSelect={onChange && !disabled ? (index) => onChange({ kind: "single", index }) : undefined}
          correctIndex={revealed ? question.correctIndex : undefined}
          disabled={disabled}
        />
      );
    }

    if (draft.kind === "multi") {
      const correctOptions = revealed ? ((question.answerKey?.correctOptions as number[] | undefined) ?? []) : undefined;
      return (
        <MultiSelectOptionList
          options={translation?.options ?? []}
          selected={draft.indices ?? []}
          onToggle={
            onChange && !disabled
              ? (index) => {
                  const current = new Set(draft.indices ?? []);
                  if (current.has(index)) current.delete(index);
                  else current.add(index);
                  onChange({ kind: "multi", indices: [...current].sort((a, b) => a - b) });
                }
              : undefined
          }
          correctOptions={correctOptions}
          disabled={disabled}
        />
      );
    }

    if (draft.kind === "text") {
      const isCorrect = revealed ? outcome === "CORRECT" : undefined;
      return (
        <FreeTextInput
          value={draft.value}
          onChange={onChange && !disabled ? (value) => onChange({ kind: "text", value }) : undefined}
          numeric={question.questionType === "NUMERIC"}
          placeholder={question.questionType === "NUMERIC" ? "Enter a number" : "Enter your answer"}
          disabled={disabled}
          isCorrect={isCorrect}
        />
      );
    }

    if (draft.kind === "match") {
      const leftKeys = (question.contentStructure?.leftKeys as string[] | undefined) ?? [];
      const leftLabels = (translation?.content?.leftLabels as Record<string, string> | undefined) ?? {};
      const rightKeys = (question.contentStructure?.rightKeys as string[] | undefined) ?? [];
      const rightLabels = (translation?.content?.rightLabels as Record<string, string> | undefined) ?? {};
      const leftItems: MatchItem[] = leftKeys.map((key) => ({ key, label: leftLabels[key] ?? key }));
      const rightItems: MatchItem[] = shuffleStable(
        rightKeys.map((key) => ({ key, label: rightLabels[key] ?? key })),
        question.id,
      );
      return (
        <MatchPairing
          leftItems={leftItems}
          rightItems={rightItems}
          mapping={draft.mapping ?? {}}
          onPair={
            onChange && !disabled
              ? (leftKey, rightKey) => onChange({ kind: "match", mapping: { ...(draft.mapping ?? {}), [leftKey]: rightKey } })
              : undefined
          }
          disabled={disabled}
          correctMapping={revealed ? ((question.answerKey?.correctMapping as Record<string, string> | undefined) ?? null) : null}
        />
      );
    }

    // draft.kind === "order"
    const itemKeys = (question.contentStructure?.itemKeys as string[] | undefined) ?? [];
    const itemLabels = (translation?.content?.itemLabels as Record<string, string> | undefined) ?? {};
    const items: OrderingItem[] = shuffleStable(
      itemKeys.map((key) => ({ key, label: itemLabels[key] ?? key })),
      question.id,
    );
    return (
      <OrderingBuilder
        items={items}
        order={draft.order ?? []}
        onToggle={
          onChange && !disabled
            ? (key) => {
                const current = draft.order ?? [];
                const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
                onChange({ kind: "order", order: next });
              }
            : undefined
        }
        disabled={disabled}
        correctOrder={revealed ? ((question.answerKey?.correctOrder as string[] | undefined) ?? null) : null}
      />
    );
  }
}
