import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { PressableScale } from "../ui/PressableScale";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { AuthLayout, buildAuthTextStyles } from "./AuthLayout";
import { OTP_LENGTH, OtpCodeInput, type OtpCodeInputHandle } from "./OtpCodeInput";

/** Mirrors the server's EmailOtpService.RESEND_COOLDOWN_SECONDS. The server is the authority. */
export const RESEND_COOLDOWN_SECONDS = 60;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Step 2: the code.
 *
 * <h2>It submits itself on the sixth digit — once per code value</h2>
 * Typing, pasting or autofill all end the same way, so there is no extra tap. What it must never do
 * is retry: the server allows five wrong guesses per code and then kills it, so an automatic retry
 * would spend the student's attempts for them. A wrong code is shown as wrong and left alone until
 * they change it.
 */
export function CodeStep({
  email,
  sentAt,
  expiresInMinutes,
  emailed,
  verifying,
  resending,
  error,
  onVerify,
  onResend,
  onChangeEmail,
  onEdit,
}: {
  email: string;
  /** When the current code was issued (ms). Drives the resend countdown. */
  sentAt: number;
  expiresInMinutes: number;
  emailed: boolean;
  verifying: boolean;
  resending: boolean;
  error: string | null;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeEmail: () => void;
  /** Called when the student edits the code, so a stale error can be cleared. */
  onEdit: () => void;
}) {
  const styles = useThemedStyles(buildStyles);
  const text = useThemedStyles(buildAuthTextStyles);
  const { colors } = useTheme();
  const inputRef = useRef<OtpCodeInputHandle>(null);

  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((now - sentAt) / 1000));
  const expired = now - sentAt > expiresInMinutes * 60_000;
  const busy = verifying || resending;

  const verify = (digits: string) => {
    if (digits.length === OTP_LENGTH && !busy) onVerify(digits);
  };

  return (
    <AuthLayout
      top={
        <PressableScale
          onPress={onChangeEmail}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Change email address"
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
          <Text style={styles.backLabel}>Change email</Text>
        </PressableScale>
      }
      footer={
        <Text style={text.footnote}>
          Can&apos;t find it? Check your Spam or Promotions folder. The email comes from SarkariTaiyaari.
        </Text>
      }
    >
      <Text style={text.title} accessibilityRole="header">
        Verify your email
      </Text>
      <Text style={text.subtitle}>
        {emailed ? "We've sent a 6-digit code to" : "A 6-digit code was issued for"}
        {"\n"}
        <Text style={text.strong}>{email}</Text>
      </Text>

      <OtpCodeInput
        ref={inputRef}
        value={code}
        onChange={(digits) => {
          setCode(digits);
          onEdit();
        }}
        onComplete={verify}
        error={error !== null}
        disabled={busy}
      />

      <View style={styles.statusRow}>
        {verifying ? (
          <View style={styles.inline}>
            <ActivityIndicator size="small" color={colors.brand.primary} />
            <Text style={text.hint}>Verifying…</Text>
          </View>
        ) : error ? (
          <Text style={text.fieldError} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : expired ? (
          <Text style={text.fieldError} accessibilityLiveRegion="polite">
            This code has expired. Ask for a new one below.
          </Text>
        ) : !emailed ? (
          // Honest about a developer build rather than claiming an email that never left.
          <Text style={text.hint}>This build isn&apos;t sending email yet — the code is in the server log.</Text>
        ) : (
          <Text style={text.hint}>The code expires in {expiresInMinutes} minutes.</Text>
        )}
      </View>

      <Button
        size="lg"
        onPress={() => verify(code)}
        disabled={code.length !== OTP_LENGTH || busy}
        loading={verifying}
        style={styles.cta}
      >
        Verify and continue
      </Button>

      <View style={styles.resendBlock}>
        <Text style={styles.resendPrompt}>Didn&apos;t receive the code?</Text>
        {resending ? (
          <ActivityIndicator size="small" color={colors.brand.primary} />
        ) : secondsLeft > 0 ? (
          <Text style={styles.resendWait} accessibilityLiveRegion="polite">
            Resend code in {formatCountdown(secondsLeft)}
          </Text>
        ) : (
          <PressableScale
            onPress={() => {
              setCode("");
              onResend();
              inputRef.current?.focus();
            }}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={text.link}>Resend code</Text>
          </PressableScale>
        )}
      </View>
    </AuthLayout>
  );
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      alignSelf: "flex-start",
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
    },
    backLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    statusRow: {
      minHeight: 28,
      marginTop: spacing.sm,
    },
    inline: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    cta: {
      marginTop: spacing.lg,
    },
    resendBlock: {
      alignItems: "center",
      gap: spacing.xs,
      marginTop: spacing.xl,
    },
    resendPrompt: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    resendWait: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.muted,
    },
  });
}
