import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../ui/ThemeContext";
import type { OptionListStyles } from "./optionListStyles";

export type MultiSelectOptionListProps = {
  options: string[];
  /** Reuses the same per-screen style factories as OptionList (badge doubles as a checkbox). */
  styles: OptionListStyles;
  selectedIndices: number[];
  /** Omitted or null = blind mode (mock-test/test.tsx): ticks show, nothing is scored yet. */
  correctIndices?: number[] | null;
  /** Present = tappable checkboxes. Absent = read-only review rows. */
  onToggle?: (index: number) => void;
  /**
   * True once the answer is locked in. A single-select list can infer "done" from
   * `selectedIndex !== null` (see OptionList) — a checklist can't, since ticking one box
   * doesn't mean the student is finished choosing. The screen has to say so explicitly.
   */
  submitted?: boolean;
  disabled?: boolean;
  iconSize?: number;
};

/**
 * MULTIPLE_CHOICE's renderer (TASK-2301 Phase P2 Wave A) — a checklist sibling to
 * OptionList, kept separate rather than folded in so the already-verified single-select
 * component stays untouched. All-or-nothing scoring means review mode marks every correct
 * option missed, not just what was picked wrong.
 */
export function MultiSelectOptionList({
  options,
  styles,
  selectedIndices,
  correctIndices,
  onToggle,
  submitted,
  disabled,
  iconSize = 20,
}: MultiSelectOptionListProps) {
  const { colors } = useTheme();
  const blind = correctIndices === undefined || correctIndices === null;
  const revealed = !blind && (!onToggle || submitted === true);

  return (
    <View style={styles.list}>
      {options.map((option, index) => {
        const isSelected = selectedIndices.includes(index);
        const isCorrectOption = revealed && Boolean(correctIndices?.includes(index));
        const isPickedWrong = revealed && isSelected && !isCorrectOption;
        const isMissedCorrect = revealed && !isSelected && isCorrectOption;

        const rowStyle = [
          styles.row,
          blind ? isSelected && styles.rowSelected : (isCorrectOption || isMissedCorrect) && styles.rowCorrect,
          isPickedWrong && styles.rowWrong,
        ];

        const content = (
          <>
            <View
              style={[
                styles.badge,
                blind ? isSelected && styles.badgeSelected : isCorrectOption && styles.badgeCorrect,
                isPickedWrong && styles.badgeWrong,
              ]}
            >
              {isSelected && (
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={
                    (blind && isSelected) || isCorrectOption || isPickedWrong
                      ? colors.text.onAccent
                      : colors.text.primary
                  }
                />
              )}
            </View>

            <Text style={styles.text}>{option}</Text>

            {isCorrectOption && <Ionicons name="checkmark-circle" size={iconSize} color={colors.semantic.success} />}
            {isPickedWrong && <Ionicons name="close-circle" size={iconSize} color={colors.semantic.error} />}
          </>
        );

        if (!onToggle) {
          return (
            <View key={index} style={rowStyle}>
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={index}
            disabled={disabled}
            onPress={() => onToggle(index)}
            style={rowStyle}
            accessibilityRole="checkbox"
            accessibilityLabel={option}
            accessibilityState={{ checked: isSelected }}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}
