import { StyleSheet, TextInput, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

export type FreeTextAnswerInputProps = {
  value: string;
  onChangeText?: (text: string) => void;
  keyboardType?: "default" | "numeric";
  placeholder?: string;
  /** Present = editable. Absent = read-only review row (mirrors OptionList's onSelect convention). */
  disabled?: boolean;
  /** Reveal styling for Practice's immediate-feedback screens. Omitted = blind (Mock Test). */
  isCorrect?: boolean | null;
};

/**
 * NUMERIC's and FILL_BLANK's shared renderer (TASK-2301 Phase P2 Wave B) — both are a
 * single free-text field, differing only in keyboard type. Kept as one component rather
 * than two near-identical ones, unlike MultiSelectOptionList/OptionList's split, because
 * there is no meaningfully different interaction to keep separate here.
 */
export function FreeTextAnswerInput({
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
  disabled,
  isCorrect,
}: FreeTextAnswerInputProps) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const revealStyle = isCorrect === true ? styles.correct : isCorrect === false ? styles.wrong : null;

  return (
    <View style={[styles.box, revealStyle]}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const buildStyles = ({ colors, spacing: sp, radius: rad }: Theme) =>
  StyleSheet.create({
    box: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: rad.md,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: sp.md,
    },
    input: {
      paddingVertical: sp.md,
      fontSize: 16,
      color: colors.text.primary,
    },
    correct: { borderColor: colors.semantic.success, backgroundColor: colors.semantic.successBg },
    wrong: { borderColor: colors.semantic.error, backgroundColor: colors.semantic.errorBg },
  });
