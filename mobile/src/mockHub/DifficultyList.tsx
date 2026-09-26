import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View, StyleSheet } from "react-native";
import type { DifficultyLevel } from "../data/practiceData";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

type Props = {
  levels: DifficultyLevel[];
  selected: DifficultyLevel | null;
  onSelect: (level: DifficultyLevel) => void;
};

/**
 * Difficulty Mock's only step — one difficulty, no "All" row, since picking none is what
 * every other format already is. Reuses the same synced admin-set color/icon per level that
 * `DifficultyPickerDialog` renders, styled as a plain in-page list rather than a modal (there
 * is no topic context here for a dialog to float over).
 */
export function DifficultyList({ levels, selected, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);

  return (
    <View style={styles.list}>
      {levels.map((level, index) => {
        const isSelected = level.code === selected?.code;
        const tint = level.color ?? colors.text.secondary;
        const tintBg = level.colorBg ?? colors.surfaceElevated2;
        return (
          <Pressable
            key={level.code}
            onPress={() => onSelect(level)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            style={[styles.row, index > 0 && styles.rowDivider, isSelected && styles.rowSelected]}
          >
            <View style={[styles.icon, { backgroundColor: tintBg }]}>
              <Ionicons name={(level.icon as keyof typeof Ionicons.glyphMap) ?? "layers-outline"} size={18} color={tint} />
            </View>
            <Text style={styles.label}>{level.label}</Text>
            {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.brand.primary} />}
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
    label: {
      flex: 1,
      fontWeight: "600",
      fontSize: 15,
      color: colors.text.primary,
    },
  });
