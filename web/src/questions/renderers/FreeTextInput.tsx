/**
 * NUMERIC's and FILL_BLANK's shared renderer — both are a single free-text field, differing
 * only in the keyboard/input mode. One component rather than two near-identical ones, same
 * reasoning as mobile's FreeTextAnswerInput.
 */
export function FreeTextInput({
  value,
  onChange,
  numeric,
  placeholder,
  disabled,
  isCorrect,
}: {
  value: string;
  onChange?: (value: string) => void;
  numeric?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Present = reveal styling (Practice). Absent = blind (Mock Test). */
  isCorrect?: boolean | null;
}) {
  const state = isCorrect === true ? "field-input-correct" : isCorrect === false ? "field-input-wrong" : "";
  return (
    <input
      className={`field-input ${state}`}
      type={numeric ? "text" : "text"}
      inputMode={numeric ? "decimal" : "text"}
      value={value}
      placeholder={placeholder}
      disabled={disabled || !onChange}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}
