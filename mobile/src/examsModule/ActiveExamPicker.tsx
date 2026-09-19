import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useActiveExam } from "./activeExamContext";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

/**
 * "Select active exam" — a radio list of My Exams, following `LanguagePickerModal`'s exact
 * shape (backdrop, card, tappable rows, a checkmark on the current one) because that is this
 * app's established picker idiom and a second visual language for the same job would be worse
 * than a familiar one.
 *
 * Selecting an exam calls the provider's `setActiveExam` and nothing else: the blocking
 * overlay, the persistence and the state update all belong to that one operation, so this
 * component cannot drift from any other switching entry point.
 */
export function ActiveExamPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const { myExams, activeExam, setActiveExam } = useActiveExam();

  function handleSelect(examCode: string) {
    // Closed first, deliberately: the switch raises a full-screen overlay of its own, and two
    // modals fighting over the screen is a real source of stuck-dialog bugs on Android.
    onClose();
    if (examCode !== activeExam?.code) {
      void setActiveExam(examCode);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t("exams.selectActiveExam")}</Text>
          <ScrollView style={styles.list}>
            {myExams.map((exam) => {
              const isActive = exam.code === activeExam?.code;
              return (
                <Pressable
                  key={exam.code}
                  onPress={() => handleSelect(exam.code)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={isActive ? `${exam.name}, ${t("exams.active")}` : exam.name}
                >
                  <Ionicons
                    name={isActive ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={isActive ? colors.brand.light : colors.text.muted}
                  />
                  <Text style={[styles.rowText, isActive && styles.rowTextActive]}>{exam.name}</Text>
                  {isActive ? <Text style={styles.activeTag}>{t("exams.active")}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      justifyContent: "center",
      padding: spacing.xl,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      maxHeight: "70%",
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    list: {
      flexGrow: 0,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    rowPressed: {
      backgroundColor: colors.surfaceElevated2,
    },
    rowText: {
      flex: 1,
      fontSize: 15,
      color: colors.text.primary,
    },
    rowTextActive: {
      fontWeight: "700",
    },
    activeTag: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.brand.light,
    },
  });
