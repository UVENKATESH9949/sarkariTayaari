import { StyleSheet, Text, View } from "react-native";
import { spacing, radius } from "../ui/theme";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

/**
 * The authored block ASSERTION_REASON and STATEMENT_COMBINATION show above their (still
 * ordinary, index-based) OptionList — the four options remain "which combination is
 * correct" text; this is what that text refers to (TASK-2301 Phase P2 Wave A).
 */
export function ContentPreamble({
  questionType,
  content,
}: {
  questionType?: string | null;
  content?: Record<string, unknown> | null;
}) {
  const styles = useThemedStyles(buildStyles);
  const t = useT();

  if (!content) return null;

  if (questionType === "ASSERTION_REASON") {
    const assertion = typeof content.assertion === "string" ? content.assertion : "";
    const reason = typeof content.reason === "string" ? content.reason : "";
    if (!assertion && !reason) return null;
    return (
      <View style={styles.box}>
        <Text style={styles.line}>
          <Text style={styles.label}>{t("quiz.assertion")}: </Text>
          {assertion}
        </Text>
        <Text style={styles.line}>
          <Text style={styles.label}>{t("quiz.reason")}: </Text>
          {reason}
        </Text>
      </View>
    );
  }

  if (questionType === "STATEMENT_COMBINATION") {
    const statements = Array.isArray(content.statements)
      ? content.statements.filter((s): s is string => typeof s === "string")
      : [];
    if (statements.length === 0) return null;
    return (
      <View style={styles.box}>
        {statements.map((statement, index) => (
          <Text key={index} style={styles.line}>
            <Text style={styles.label}>{index + 1}. </Text>
            {statement}
          </Text>
        ))}
      </View>
    );
  }

  return null;
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    box: {
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.sm + 2,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    line: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    label: {
      fontWeight: "700",
    },
  });
