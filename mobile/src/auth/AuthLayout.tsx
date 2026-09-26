import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

/**
 * The frame both sign-in steps share: safe areas, keyboard avoidance, the brand mark, and a footer
 * pinned to the bottom of short screens (it scrolls with the content once the keyboard is up).
 *
 * The brand mark is the one the app already used here — a blue tile with the school glyph. There
 * is no drawn SarkariTaiyaari logo in the project yet (`assets/images/icon.png` is still Expo's
 * default), and inventing one here would put a mark on this screen that appears nowhere else.
 */
export function AuthLayout({ top, children, footer }: { top?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>{top}</View>

        <View style={styles.brandRow} accessibilityRole="header">
          <View style={[styles.brandMark, { backgroundColor: colors.brand.primary }]}>
            <Ionicons name="school" size={24} color={colors.text.onAccent} />
          </View>
          <Text style={styles.brand}>SarkariTaiyaari</Text>
        </View>

        <View style={styles.content}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    container: {
      flexGrow: 1,
      paddingHorizontal: spacing.xl,
    },
    topRow: {
      minHeight: 40,
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing["2xl"],
    },
    brandMark: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    brand: {
      fontSize: 19,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: colors.text.primary,
    },
    content: {
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
    },
    footer: {
      marginTop: "auto",
      paddingTop: spacing["2xl"],
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
    },
  });
}

/** Shared by both steps so the two screens read as one flow. */
export function buildAuthTextStyles({ colors }: Theme) {
  return StyleSheet.create({
    title: {
      fontSize: 26,
      lineHeight: 33,
      fontWeight: "700",
      letterSpacing: -0.3,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.text.secondary,
      marginTop: spacing.sm,
      marginBottom: spacing["2xl"],
    },
    strong: {
      fontWeight: "600",
      color: colors.text.primary,
    },
    fieldError: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.semantic.error,
      marginTop: spacing.sm,
    },
    hint: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.text.muted,
      marginTop: spacing.sm,
    },
    footnote: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.text.muted,
      textAlign: "center",
    },
    link: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.brand.primary,
    },
  });
}
