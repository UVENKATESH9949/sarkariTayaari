import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IoniconName } from "../constants/subjects";
import { PressableScale } from "./PressableScale";
import { colors, radius, spacing } from "./theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "lg";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
  onPress: () => void;
  children: string;
  style?: StyleProp<ViewStyle>;
};

const TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: colors.text.onAccent,
  secondary: colors.brand.light,
  ghost: colors.brand.light,
  danger: colors.text.onAccent,
};

/** The one button primitive — replaces every hand-rolled CTA across screens. */
export function Button({ variant = "primary", size = "md", loading, disabled, icon, onPress, children, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  const textColor = TEXT_COLOR[variant];

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      scaleTo={0.97}
      style={[styles.base, sizeStyles[size], variantStyles[variant], isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={textColor} style={styles.icon} /> : null}
          <Text style={[styles.label, { color: textColor }]}>{children}</Text>
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
});

const sizeStyles = StyleSheet.create({
  md: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  lg: {
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    width: "100%",
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: colors.semantic.error,
  },
});
