import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IoniconName } from "../constants/subjects";
import { PressableScale } from "./PressableScale";
import { colors, radius, shadow, spacing } from "./theme";

type CardVariant = "elevated" | "filled" | "container";

type CardProps = {
  /** elevated = dark surface+border (default), filled = dark surface + blue glow accent (hero cards), container = bordered wrapper for CardRow children. */
  variant?: CardVariant;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * The one card primitive, covering the three ad hoc card idioms that had
 * accumulated across screens (white-bordered, dark-filled, bordered-row-container).
 */
export function Card({ variant = "elevated", onPress, disabled, style, children }: CardProps) {
  const body = [variantStyles[variant], disabled && styles.disabled, style];

  if (onPress) {
    return (
      <PressableScale onPress={onPress} disabled={disabled} style={body}>
        {children}
      </PressableScale>
    );
  }
  return <View style={body}>{children}</View>;
}

type CardRowProps = {
  icon: IoniconName;
  iconColor?: string;
  iconBg?: string;
  label: string;
  labelColor?: string;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
};

/** A tap row with a leading icon circle and trailing chevron/action — the "settings row" idiom. */
export function CardRow({
  icon,
  iconColor = colors.brand.light,
  iconBg = colors.surfaceElevated2,
  label,
  labelColor = colors.text.primary,
  value,
  trailing,
  onPress,
  disabled,
}: CardRowProps) {
  const content = (
    <>
      <View style={[styles.rowIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.text.muted} /> : null)}
    </>
  );

  if (onPress) {
    return (
      <PressableScale onPress={onPress} disabled={disabled} scaleTo={0.99} style={styles.row}>
        {content}
      </PressableScale>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

/** A 1px divider between CardRows inside a `container` Card. */
export function CardDivider() {
  return <View style={styles.divider} />;
}

const variantStyles = StyleSheet.create({
  elevated: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    ...shadow.card,
  },
  filled: {
    backgroundColor: colors.surfaceElevated2,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 3,
  },
  container: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
});

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  rowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowValue: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 60,
  },
});
