import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { IoniconName } from "../constants/subjects";
import { Button } from "./Button";
import { DURATION, EASE_OUT } from "./motion";
import { colors, radius, spacing, typography } from "./theme";

export type AppDialogButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export type AppDialogVariant = "confirmation" | "info" | "warning" | "success" | "error";

export type AppDialogOptions = {
  title: string;
  message?: string;
  buttons?: AppDialogButton[];
  variant?: AppDialogVariant;
};

let currentListener: ((options: AppDialogOptions | null) => void) | null = null;

/**
 * Drop-in replacement for React Native's `Alert.alert(title, message, buttons)` — same
 * call shape (plus an optional trailing `variant`), so every existing call site swaps by
 * changing the import and `Alert.alert(...)` to `AppAlert.alert(...)`, nothing else.
 * Routes through whichever `AppDialogHost` is currently mounted (exactly one, in
 * mobile/src/app/_layout.tsx) rather than requiring a hook, so it works from anywhere —
 * including places like `(tabs)/_layout.tsx`'s `screenListeners` that aren't easy to wrap
 * in a dialog-specific provider render prop.
 */
export const AppAlert = {
  alert(title: string, message?: string, buttons?: AppDialogButton[], variant?: AppDialogVariant) {
    currentListener?.({ title, message, buttons, variant });
  },
};

function resolveVariant(options: AppDialogOptions): AppDialogVariant {
  if (options.variant) return options.variant;
  const buttons = options.buttons ?? [];
  if (buttons.length <= 1) return "info";
  if (buttons.some((b) => b.style === "destructive")) return "warning";
  return "confirmation";
}

const VARIANT_STYLE: Record<AppDialogVariant, { icon: IoniconName; color: string; bg: string }> = {
  confirmation: { icon: "help-circle", color: colors.brand.light, bg: colors.surfaceElevated2 },
  info: { icon: "information-circle", color: colors.brand.light, bg: colors.surfaceElevated2 },
  warning: { icon: "warning-outline", color: colors.semantic.warning, bg: colors.semantic.warningBg },
  success: { icon: "checkmark-circle", color: colors.semantic.success, bg: colors.semantic.successBg },
  error: { icon: "close-circle", color: colors.semantic.error, bg: colors.semantic.errorBg },
};

function buttonVariant(style: AppDialogButton["style"]): "primary" | "secondary" | "danger" {
  if (style === "destructive") return "danger";
  if (style === "cancel") return "secondary";
  return "primary";
}

/**
 * The one dialog host, mounted once at the app root. Owns the currently-shown dialog's
 * state and registers itself as `AppAlert`'s target on mount — any screen can trigger a
 * dialog through `AppAlert.alert(...)` without needing this component in its own tree.
 */
export function AppDialogHost() {
  const [options, setOptions] = useState<AppDialogOptions | null>(null);
  const visible = options !== null;
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);

  useEffect(() => {
    currentListener = setOptions;
    return () => {
      currentListener = null;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: DURATION.quick });
      scale.value = withTiming(1, { duration: DURATION.quick, easing: EASE_OUT });
    } else {
      opacity.value = 0;
      scale.value = 0.92;
    }
  }, [visible, opacity, scale]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!options) return null;

  const variant = resolveVariant(options);
  const variantStyle = VARIANT_STYLE[variant];
  const buttons = options.buttons ?? [{ text: "OK" }];
  const dismiss = () => setOptions(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={[styles.iconCircle, { backgroundColor: variantStyle.bg }]}>
            <Ionicons name={variantStyle.icon} size={26} color={variantStyle.color} />
          </View>
          <Text style={styles.title}>{options.title}</Text>
          {options.message ? <Text style={styles.message}>{options.message}</Text> : null}

          <View style={[styles.buttonRow, buttons.length > 2 && styles.buttonColumn]}>
            {buttons.map((button, index) => (
              <Button
                key={`${button.text}-${index}`}
                variant={buttonVariant(button.style)}
                style={buttons.length <= 2 ? styles.buttonFlex : styles.buttonFull}
                onPress={() => {
                  dismiss();
                  button.onPress?.();
                }}
              >
                {button.text}
              </Button>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 3, 5, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    ...typography.cardTitle,
    fontSize: 17,
    textAlign: "center",
  },
  message: {
    ...typography.secondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginTop: spacing.xl,
    width: "100%",
  },
  buttonColumn: {
    flexDirection: "column",
  },
  buttonFlex: {
    flex: 1,
  },
  buttonFull: {
    width: "100%",
  },
});
