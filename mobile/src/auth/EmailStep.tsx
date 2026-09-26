import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../ui/Button";
import { PressableScale } from "../ui/PressableScale";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { AuthLayout, buildAuthTextStyles } from "./AuthLayout";

/** Only Gmail for now, at the project owner's instruction — the server enforces the same rule. */
const ALLOWED_DOMAIN = "gmail.com";

export type EmailValidation = { ok: true; email: string } | { ok: false; message: string };

/** Exported for reuse and so the rules are written down in one place. */
export function validateEmail(raw: string): EmailValidation {
  const email = raw.trim().toLowerCase();
  if (email.length === 0) return { ok: false, message: "Enter your email address." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "That doesn't look like an email address." };
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) return { ok: false, message: "Only Gmail addresses (@gmail.com) are supported right now." };
  return { ok: true, email };
}

/**
 * Step 1: the address.
 *
 * Validation is shown inline, and only once it is useful — after the field loses focus or the
 * student presses Continue — so nobody is told their address is invalid while still typing it.
 */
export function EmailStep({
  initialEmail,
  busy,
  serverError,
  onSubmit,
  google,
}: {
  initialEmail: string;
  busy: boolean;
  serverError: string | null;
  onSubmit: (email: string) => void;
  /** Absent when this build has no Google sign-in; the divider and button are then not shown. */
  google?: { busy: boolean; error: string | null; onPress: () => void };
}) {
  const styles = useThemedStyles(buildStyles);
  const text = useThemedStyles(buildAuthTextStyles);
  const { colors } = useTheme();

  const [email, setEmail] = useState(initialEmail);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  const validation = validateEmail(email);
  const fieldError = touched && !validation.ok ? validation.message : null;
  const shownError = fieldError ?? serverError;

  const submit = () => {
    setTouched(true);
    if (validation.ok && !busy) onSubmit(validation.email);
  };

  return (
    <AuthLayout
      footer={
        <Text style={text.footnote}>
          We only use your email to sign you in and keep your progress safe across devices.
        </Text>
      }
    >
      <Text style={text.title} accessibilityRole="header">
        Sign in or create an account
      </Text>
      <Text style={text.subtitle}>
        Enter your email and we&apos;ll send you a 6-digit code. No password needed.
      </Text>

      <Text style={styles.label} nativeID="email-label">
        Email address
      </Text>
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          shownError !== null && styles.fieldError,
          busy && styles.fieldDisabled,
        ]}
      >
        <Ionicons
          name="mail-outline"
          size={20}
          color={shownError ? colors.semantic.error : focused ? colors.brand.primary : colors.text.muted}
        />
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (email.trim().length > 0) setTouched(true);
          }}
          placeholder="you@gmail.com"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          inputMode="email"
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={submit}
          accessibilityLabelledBy="email-label"
          accessibilityLabel="Email address"
          underlineColorAndroid="transparent"
        />
        {validation.ok && !shownError ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.semantic.success} />
        ) : null}
      </View>
      {shownError ? (
        <Text style={text.fieldError} accessibilityLiveRegion="polite">
          {shownError}
        </Text>
      ) : (
        <Text style={text.hint}>Gmail addresses only, for now.</Text>
      )}

      <Button size="lg" onPress={submit} loading={busy} disabled={busy || google?.busy} style={styles.cta}>
        Continue
      </Button>

      {google ? (
        <>
          <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
          <PressableScale
            onPress={google.onPress}
            disabled={busy || google.busy}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityState={{ disabled: busy || google.busy, busy: google.busy }}
            style={[styles.googleButton, (busy || google.busy) && styles.fieldDisabled]}
          >
            {google.busy ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color={colors.text.primary} />
                <Text style={styles.googleLabel}>Continue with Google</Text>
              </>
            )}
          </PressableScale>
          {google.error ? (
            <Text style={[text.fieldError, styles.googleError]} accessibilityLiveRegion="polite">
              {google.error}
            </Text>
          ) : null}
        </>
      ) : null}
    </AuthLayout>
  );
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 54,
      paddingHorizontal: spacing.base,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    fieldFocused: {
      borderColor: colors.brand.primary,
      backgroundColor: colors.surface,
    },
    fieldError: {
      borderColor: colors.semantic.error,
    },
    fieldDisabled: {
      opacity: 0.6,
    },
    input: {
      flex: 1,
      fontSize: 16,
      paddingVertical: spacing.md,
      color: colors.text.primary,
    },
    cta: {
      marginTop: spacing.xl,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginVertical: spacing.xl,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: 13,
      color: colors.text.muted,
    },
    googleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      minHeight: 54,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    googleLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text.primary,
    },
    googleError: {
      textAlign: "center",
    },
  });
}
