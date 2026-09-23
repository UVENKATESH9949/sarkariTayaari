import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { toSubjectMeta } from "../constants/subjects";
import type { SubjectStat } from "../data/practiceData";
import { DURATION } from "../ui/motion";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";
import { questionsLabel } from "@sarkaritaiyaari/core/i18n";

type Props = {
  subjects: SubjectStat[];
  selected: SubjectStat | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (subject: SubjectStat) => void;
};

/**
 * The subject picker: one row that opens into the list, in place.
 *
 * It expands inline rather than opening a modal on purpose. A modal would be a second
 * surface covering the topics the student is choosing between, which is the friction the
 * whole redesign exists to remove; expanding in place keeps the answer next to the
 * question. The exam's syllabus is a handful of subjects, so the open list never needs to
 * be tall - it is capped and scrolls rather than pushing the topics off screen.
 *
 * Icon and both of its colours come from the synced subject row (`toSubjectMeta`), which
 * is what keeps every topic under a subject sharing one restrained tint instead of each
 * row inventing its own.
 */
export function SubjectSelect({ subjects, selected, open, onToggle, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const fallback = { iconColor: colors.text.secondary, iconBg: colors.surfaceElevated2 };
  const selectedMeta = toSubjectMeta(selected, selected?.name ?? "", fallback);

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          selected ? t("practice.subjectSelected", { subject: selected.name }) : t("practice.chooseSubject")
        }
        style={({ pressed }) => [styles.trigger, open && styles.triggerOpen, pressed && styles.triggerPressed]}
      >
        <View style={[styles.icon, { backgroundColor: selectedMeta.iconBg }]}>
          <Ionicons name={selectedMeta.icon} size={22} color={selectedMeta.iconColor} />
        </View>
        <View style={styles.triggerText}>
          <Text style={styles.subjectName} numberOfLines={1}>
            {selected?.name ?? t("practice.chooseSubject")}
          </Text>
          {selected && (
            <Text style={styles.subjectMeta}>
              {selected.questionCount === 0
                ? t("practice.noQuestionsForExam")
                : questionsLabel(selected.questionCount, t)}
            </Text>
          )}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.text.secondary} />
      </Pressable>

      {open && (
        <Animated.View style={styles.panel} entering={FadeIn.duration(DURATION.quick)}>
          <ScrollView style={styles.panelScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {subjects.map((subject, index) => {
              const meta = toSubjectMeta(subject, subject.name, fallback);
              const isSelected = subject.id === selected?.id;
              const empty = subject.questionCount === 0;
              return (
                <Pressable
                  key={subject.id}
                  onPress={() => onSelect(subject)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && styles.optionDivider,
                    isSelected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View style={[styles.optionIcon, { backgroundColor: meta.iconBg }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.iconColor} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionName, isSelected && styles.optionNameSelected]} numberOfLines={1}>
                      {subject.name}
                    </Text>
                    <Text style={styles.optionMeta}>
                      {empty ? t("practice.noQuestionsForExam") : questionsLabel(subject.questionCount, t)}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.brand.primary} />}
                </Pressable>
              );
            })}
            {subjects.length === 0 && <Text style={styles.emptyText}>{t("practice.noSubjects")}</Text>}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const buildStyles = ({ colors, shadow }: Theme) =>
  StyleSheet.create({
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md + 2,
      minHeight: 78,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: 18,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      ...shadow.card,
    },
    triggerOpen: {
      borderColor: colors.borderAccent,
    },
    triggerPressed: {
      backgroundColor: colors.surfaceElevated2,
    },
    icon: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
    },
    triggerText: {
      flex: 1,
    },
    subjectName: {
      fontWeight: "600",
      fontSize: 18,
      lineHeight: 24,
      color: colors.text.primary,
    },
    subjectMeta: {
      fontWeight: "400",
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.muted,
      marginTop: 2,
    },
    panel: {
      marginTop: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: 18,
      overflow: "hidden",
      ...shadow.card,
    },
    panelScroll: {
      // Roughly four rows. Past that it scrolls rather than pushing the topic list, which
      // is the thing the student came here to look at.
      maxHeight: 268,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
    },
    optionDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    optionSelected: {
      backgroundColor: colors.brand.glowSoft,
    },
    optionPressed: {
      backgroundColor: colors.surfaceElevated2,
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    optionText: {
      flex: 1,
    },
    optionName: {
      fontWeight: "500",
      fontSize: 16,
      lineHeight: 22,
      color: colors.text.primary,
    },
    optionNameSelected: {
      fontWeight: "600",
    },
    optionMeta: {
      fontWeight: "400",
      fontSize: 13,
      lineHeight: 18,
      color: colors.text.muted,
      marginTop: 1,
    },
    emptyText: {
      fontWeight: "400",
      fontSize: 14,
      color: colors.text.muted,
      textAlign: "center",
      paddingVertical: spacing.xl,
    },
  });
