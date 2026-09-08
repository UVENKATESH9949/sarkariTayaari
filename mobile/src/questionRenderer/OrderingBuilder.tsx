import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

export type OrderingItem = { key: string; label: string };

export type OrderingBuilderProps = {
  /** Every item, in a shuffled (not-yet-ordered) display order — see the shuffle note at the call site. */
  items: OrderingItem[];
  /** The student's order-in-progress so far. */
  order: string[];
  /** Present = tappable (append/remove). Absent = read-only review. */
  onToggle?: (key: string) => void;
  disabled?: boolean;
  /** The real correctOrder, for reveal. Omitted/null = blind (Mock Test). */
  correctOrder?: string[] | null;
};

/**
 * ORDERING's renderer (TASK-2301 Phase P2 Wave B) — tap an item in the "Available items"
 * pool to append it to "Your order"; tap an item already in "Your order" to send it back
 * to the pool. Chosen over drag handles for the same reason MatchPairing chose tap-to-pair:
 * no gesture library, trivially driveable by a single tap.
 */
export function OrderingBuilder({ items, order, onToggle, disabled, correctOrder }: OrderingBuilderProps) {
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const revealed = correctOrder !== undefined && correctOrder !== null;
  const byKey = new Map(items.map((item) => [item.key, item]));
  const poolKeys = items.map((item) => item.key).filter((key) => !order.includes(key));

  return (
    <View>
      <Text style={styles.sectionLabel}>{t("quiz.yourOrder")}</Text>
      <View style={styles.orderedList}>
        {order.length === 0 && <Text style={styles.placeholder}>{t("quiz.orderingPlaceholder")}</Text>}
        {order.map((key, index) => {
          const item = byKey.get(key);
          const isCorrectPosition = revealed && correctOrder![index] === key;
          const isWrongPosition = revealed && !isCorrectPosition;
          return (
            <Pressable
              key={key}
              style={[styles.orderedRow, isCorrectPosition && styles.rowCorrect, isWrongPosition && styles.rowWrong]}
              onPress={() => onToggle?.(key)}
              disabled={disabled}
            >
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.itemText}>{item?.label ?? key}</Text>
            </Pressable>
          );
        })}
      </View>

      {poolKeys.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t("quiz.availableItems")}</Text>
          <View style={styles.pool}>
            {poolKeys.map((key) => {
              const item = byKey.get(key);
              return (
                <Pressable key={key} style={styles.poolChip} onPress={() => onToggle?.(key)} disabled={disabled}>
                  <Text style={styles.itemText}>{item?.label ?? key}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const buildStyles = ({ colors, spacing, radius }: Theme) =>
  StyleSheet.create({
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    orderedList: { gap: spacing.sm, marginBottom: spacing.md },
    placeholder: { fontSize: 13, color: colors.text.muted, fontStyle: "italic" },
    orderedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      backgroundColor: colors.surfaceElevated,
    },
    rowCorrect: { borderColor: colors.semantic.success, backgroundColor: colors.semantic.successBg },
    rowWrong: { borderColor: colors.semantic.error, backgroundColor: colors.semantic.errorBg },
    badge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.brand.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontSize: 11, fontWeight: "700", color: colors.text.onAccent },
    itemText: { flex: 1, fontSize: 13, color: colors.text.primary },
    pool: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    poolChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surfaceElevated2,
    },
  });
