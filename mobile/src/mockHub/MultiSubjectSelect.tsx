import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { toSubjectMeta } from "../constants/subjects";
import type { SubjectStat } from "../data/practiceData";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { questionsLabel } from "@sarkaritaiyaari/core/i18n";
import { useT } from "../i18n/I18nContext";

type Props = {
  subjects: SubjectStat[];
  selectedIds: ReadonlySet<string>;
  onToggle: (subjectId: string) => void;
};

/**
 * Multi-Subject and Speed Mock's subject step — a checklist rather than `SubjectSelect`'s
 * single-select expanding row, since both formats can span more than one subject at once.
 * Styled to match `SubjectSelect`'s row/icon language rather than sharing its component,
 * since their selection semantics (single vs. multi) genuinely differ.
 */
export function MultiSubjectSelect({ subjects, selectedIds, onToggle }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const fallback = { iconColor: colors.text.secondary, iconBg: colors.surfaceElevated2 };

  return (
    <View style={styles.list}>
      {subjects.map((subject, index) => {
        const meta = toSubjectMeta(subject, subject.name, fallback);
        const isSelected = selectedIds.has(subject.id);
        return (
          <Pressable
            key={subject.id}
            onPress={() => onToggle(subject.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            style={[styles.row, index > 0 && styles.rowDivider, isSelected && styles.rowSelected]}
          >
            <View style={[styles.icon, { backgroundColor: meta.iconBg }]}>
              <Ionicons name={meta.icon} size={18} color={meta.iconColor} />
            </View>
            <View style={styles.textBlock}>
              <Text style={styles.name} numberOfLines={1}>
                {subject.name}
              </Text>
              <Text style={styles.meta}>{questionsLabel(subject.questionCount, t)}</Text>
            </View>
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={20}
              color={isSelected ? colors.brand.primary : colors.text.muted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const buildStyles = ({ colors, shadow }: Theme) =>
  StyleSheet.create({
    list: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: 18,
      overflow: "hidden",
      ...shadow.card,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    rowSelected: {
      backgroundColor: colors.brand.glowSoft,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    textBlock: {
      flex: 1,
    },
    name: {
      fontWeight: "500",
      fontSize: 16,
      color: colors.text.primary,
    },
    meta: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 1,
    },
  });
