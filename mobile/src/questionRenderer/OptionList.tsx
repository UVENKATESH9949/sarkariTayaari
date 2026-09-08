import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../ui/ThemeContext";
import type { OptionListStyles } from "./optionListStyles";

export type OptionListProps = {
  options: string[];
  styles: OptionListStyles;
  /** The one leading indicator this list draws — everything else follows from it. */
  badge: "letter" | "radio" | "none";
  selectedIndex: number | null;
  /**
   * Omitted or null = blind mode: only `selectedIndex` is ever highlighted, and the
   * correct answer is never shown on this list (mock-test/test.tsx, diagnostic-test.tsx).
   * Set = reveal mode: once something is selected, the correct row/badge turns green and
   * a wrong pick turns red (practice/quiz.tsx and every read-only review list).
   */
  correctIndex?: number | null;
  /** Present = tappable rows. Absent = read-only review rows (a plain View, not a Pressable). */
  onSelect?: (index: number) => void;
  /** Blocks further taps once an answer is locked in — practice/quiz.tsx's "first tap is final". */
  disabled?: boolean;
  /**
   * Size of the trailing checkmark/close icon. A plain prop rather than part of
   * `styles` — it genuinely varies by screen density (16 on a compact review card, 20 on
   * a full-screen quiz) but isn't a `ViewStyle`/`TextStyle`, and `useThemedStyles`'s
   * generic constraint requires every value in that object to be one.
   */
  iconSize?: number;
};

/**
 * The single option-list rendering used by every screen that shows a flat MCQ option
 * set: practice/quiz.tsx, mock-test/test.tsx, mock-test/result.tsx, revise.tsx,
 * practice/summary.tsx and diagnostic-test.tsx. Extracted so a second question type can
 * add its own renderer next to this one instead of touching six screens again — see
 * tasks/TASK-2301-multi-type-question-architecture.md, Phase P0.
 *
 * This component only knows about single-choice MCQ shapes today; it is deliberately
 * not yet generic over question type. That is P1's job, once a type discriminator
 * exists to dispatch on.
 */
export function OptionList({
  options,
  styles,
  badge,
  selectedIndex,
  correctIndex,
  onSelect,
  disabled,
  iconSize = 20,
}: OptionListProps) {
  const { colors } = useTheme();
  const blind = correctIndex === undefined || correctIndex === null;
  // A read-only review list (no onSelect) always reveals the correct answer when one is
  // given — including an unattempted mock question or a bookmark that was never
  // answered, both of which legitimately have `selectedIndex: null` and must still show
  // the correct option in green. An interactive list only reveals once something has
  // actually been picked, so a live, unanswered quiz never gives the answer away early.
  const revealed = !blind && (!onSelect || selectedIndex !== null);

  return (
    <View style={styles.list}>
      {options.map((option, index) => {
        const isSelected = selectedIndex === index;
        const isCorrect = revealed && index === correctIndex;
        const isPickedWrong = revealed && isSelected && index !== correctIndex;

        const rowStyle = [
          styles.row,
          blind ? isSelected && styles.rowSelected : isCorrect && styles.rowCorrect,
          isPickedWrong && styles.rowWrong,
        ];

        const content = (
          <>
            {badge === "letter" && (
              <View
                style={[
                  styles.badge,
                  blind ? isSelected && styles.badgeSelected : isCorrect && styles.badgeCorrect,
                  isPickedWrong && styles.badgeWrong,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    ((blind && isSelected) || isCorrect || isPickedWrong) && styles.badgeTextLight,
                  ]}
                >
                  {String.fromCharCode(65 + index)}
                </Text>
              </View>
            )}
            {badge === "radio" && (
              <Ionicons
                name={isSelected ? "radio-button-on" : "radio-button-off"}
                size={18}
                color={isSelected ? colors.brand.light : colors.text.muted}
              />
            )}

            <Text style={styles.text}>{option}</Text>

            {/* Reveal mode: the correct/wrong outcome. Blind mode with a letter badge: a
                plain "this is what you picked" acknowledgement — never a correctness signal. */}
            {isCorrect && <Ionicons name="checkmark-circle" size={iconSize} color={colors.semantic.success} />}
            {isPickedWrong && <Ionicons name="close-circle" size={iconSize} color={colors.semantic.error} />}
            {blind && badge === "letter" && isSelected && (
              <Ionicons name="checkmark-circle" size={iconSize} color={colors.text.primary} />
            )}
          </>
        );

        if (!onSelect) {
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
            onPress={() => onSelect(index)}
            style={rowStyle}
            {...(badge === "radio"
              ? { accessibilityRole: "radio" as const, accessibilityLabel: option, accessibilityState: { checked: isSelected } }
              : null)}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}
