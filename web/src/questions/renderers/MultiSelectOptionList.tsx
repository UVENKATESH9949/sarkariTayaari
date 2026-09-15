import { CheckIcon, CrossIcon } from "./renderIcons";

/**
 * MULTIPLE_CHOICE's renderer — a checkbox sibling to OptionList, kept separate rather than a
 * shared component with a mode flag, since native radio vs. checkbox semantics genuinely
 * differ (only one can be checked vs. many).
 */
export function MultiSelectOptionList({
  options,
  selected,
  onToggle,
  correctOptions,
  disabled,
}: {
  options: string[];
  selected: number[];
  onToggle?: (index: number) => void;
  /** Present = reveal (Practice). Absent = blind (Mock Test). */
  correctOptions?: number[] | null;
  disabled?: boolean;
}) {
  const revealed = correctOptions != null;
  const correctSet = new Set(correctOptions ?? []);
  const selectedSet = new Set(selected);

  return (
    <div className="option-list" role="group">
      {options.map((option, index) => {
        const isSelected = selectedSet.has(index);
        const isCorrectOption = revealed && correctSet.has(index);
        const isWrongPick = revealed && isSelected && !correctSet.has(index);

        let state = "";
        if (isCorrectOption) state = "option-correct";
        else if (isWrongPick) state = "option-wrong";
        else if (isSelected) state = "option-selected";

        return (
          <label key={index} className={`option-row ${state}`}>
            <input
              type="checkbox"
              className="option-input option-input-checkbox"
              checked={isSelected}
              disabled={disabled || !onToggle}
              onChange={() => onToggle?.(index)}
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
