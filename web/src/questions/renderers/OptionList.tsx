import { CheckIcon, CrossIcon } from "./renderIcons";

/**
 * The single-select renderer — SINGLE_CHOICE, TRUE_FALSE (via a boolean<->index adapter at
 * the call site), ASSERTION_REASON and STATEMENT_COMBINATION (both reuse this unchanged; the
 * evaluator dispatches all three through singleChoiceEvaluator, so the renderer needs no
 * per-type branching either — see questionEvaluatorFor).
 *
 * Native radio inputs drive selection (free keyboard support, free screen-reader semantics),
 * visually replaced by the styled row. `onSelect` present = interactive; absent = read-only
 * review (Summary screens re-render an already-answered question this way).
 */
export function OptionList({
  name,
  options,
  selectedIndex,
  onSelect,
  correctIndex,
  disabled,
}: {
  name: string;
  options: string[];
  selectedIndex: number | null;
  onSelect?: (index: number) => void;
  /** Present = reveal correct/incorrect styling (Practice's immediate feedback). Absent = blind (Mock Test). */
  correctIndex?: number | null;
  disabled?: boolean;
}) {
  const revealed = correctIndex !== undefined && correctIndex !== null;

  return (
    <div className="option-list" role="radiogroup">
      {options.map((option, index) => {
        const isSelected = selectedIndex === index;
        const isCorrectOption = revealed && index === correctIndex;
        const isWrongPick = revealed && isSelected && index !== correctIndex;

        let state = "";
        if (isCorrectOption) state = "option-correct";
        else if (isWrongPick) state = "option-wrong";
        else if (isSelected) state = "option-selected";

        return (
          <label key={index} className={`option-row ${state}`}>
            <input
              type="radio"
              name={name}
              className="option-input"
              checked={isSelected}
              disabled={disabled || !onSelect}
              onChange={() => onSelect?.(index)}
            />
            <span className="option-text">{option}</span>
            {isCorrectOption && <CheckIcon className="option-icon" aria-hidden="true" />}
            {isWrongPick && <CrossIcon className="option-icon" aria-hidden="true" />}
          </label>
        );
      })}
    </div>
  );
}
