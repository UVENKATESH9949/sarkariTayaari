import { useCallback, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../practice/authContext";
import { Button } from "../ui/Button";
import { PressableScale } from "../ui/PressableScale";
import { radius, spacing } from "../ui/theme";
import { useThemedStyles, useTheme, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

/**
 * The first screen after installation: sign in, or create an account, with a code emailed to a
 * Gmail address (migration V51).
 *
 * <h2>This screen is a gate, and that is a deliberate reversal</h2>
 * The app was built to work fully signed out — onboarding ran before sign-in, and practice, the
 * radar and progress all worked without an account. **The project owner asked on 2026-09-21 for an
 * account to be required**, so `AppStartGate` now shows this before anything else and there is no
 * way past it. The signed-out code paths underneath were NOT deleted: they are still correct, a
 * session can still expire mid-use, and removing them would be a large change with no upside.
 *
 * <h2>One flow, not two</h2>
 * There is no "sign up" tab. The server knows whether the address has an account and does the
 * right thing; making the student choose is asking them a question the system can answer, and
 * getting it wrong the moment somebody forgets whether they registered.
 *
 * <h2>What the copy must never claim</h2>
 * Requesting a code answers identically for a known and an unknown address, on purpose — so this
 * screen cannot say "welcome back" or "we've created your account" at that point, because it does
 * not know. It says a code is on its way, and nothing more.
 */
export function SignInFlow() {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { requestSignInCode, signInWithCode } = useAuth();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Guards a double tap on a slow connection. A second request inside the server's 60-second
  // cooldown would come back as an error the student did nothing to deserve.
  const inFlight = useRef(false);

  const trimmedEmail = email.trim().toLowerCase();
  const looksLikeGmail = /^[^\s@]+@gmail\.com$/.test(trimmedEmail);

  const sendCode = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await requestSignInCode(trimmedEmail);
      trackEvent("sign_in_code_requested");
      setStep("code");
      setNotice(
        result.emailed
          ? `We've emailed a 6-digit code to ${trimmedEmail}. It expires in ${result.expiresInMinutes} minutes.`
          : // Honest about the developer build rather than claiming an email that never left.
            `This build isn't set up to send email yet — the code is in the server log. It expires in ${result.expiresInMinutes} minutes.`,
      );
    } catch (err) {
      setError(messageFrom(err, "We couldn't send a code just now. Check your connection and try again."));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [requestSignInCode, trimmedEmail]);

  const submitCode = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await signInWithCode(trimmedEmail, code);
      // No success state to set: signing in unmounts this screen.
    } catch (err) {
      /*
       * Never retried automatically. The server allows five wrong guesses per code and then kills
       * it, so a silent retry would spend the student's remaining attempts for them.
       */
      setError(messageFrom(err, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [signInWithCode, trimmedEmail, code]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: colors.brand.primary }]}>
            <Ionicons name="school" size={22} color={colors.text.onAccent} />
          </View>
          <Text style={styles.brand}>SarkariTaiyaari</Text>
        </View>

        {step === "email" ? (
          <>
            <Text style={styles.title}>Sign in to get started</Text>
            <Text style={styles.body}>
              Your practice history is saved to your account, so it survives changing your phone.
              We&apos;ll email you a 6-digit code — no password to remember.
            </Text>

            <Text style={styles.label}>Gmail address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(next) => {
                setEmail(next);
                setError(null);
              }}
              placeholder="you@gmail.com"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!busy}
              onSubmitEditing={() => looksLikeGmail && sendCode()}
              returnKeyType="send"
            />
            {/* Stated up front rather than as a rejection after they have typed it. */}
            <Text style={styles.hint}>Only Gmail addresses for now.</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button size="lg" onPress={sendCode} disabled={!looksLikeGmail || busy} loading={busy}>
              Send me a code
            </Button>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter your code</Text>
            {notice ? <Text style={styles.body}>{notice}</Text> : null}

            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(next) => {
                setCode(next.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              placeholder="000000"
              placeholderTextColor={colors.text.muted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              editable={!busy}
              onSubmitEditing={() => code.length === 6 && submitCode()}
              returnKeyType="done"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button size="lg" onPress={submitCode} disabled={code.length !== 6 || busy} loading={busy}>
              Continue
            </Button>

            <View style={styles.secondaryRow}>
              <PressableScale
                onPress={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                  setNotice(null);
                }}
                accessibilityRole="button"
                disabled={busy}
              >
                <Text style={styles.link}>Use a different address</Text>
              </PressableScale>
              <PressableScale onPress={sendCode} accessibilityRole="button" disabled={busy}>
                <Text style={styles.link}>Resend code</Text>
              </PressableScale>
            </View>
            {/* The server enforces a 60-second gap; saying so beats an error that looks like a fault. */}
            <Text style={styles.hint}>You can ask for a new code once a minute.</Text>
          </>
        )}

        {busy ? <ActivityIndicator style={styles.spinner} color={colors.brand.primary} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Prefers the server's own message, which is written for a student and already avoids saying
 * anything it should not — the address-exists question above all.
 */
function messageFrom(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  return message && message.trim().length > 0 ? message : fallback;
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    container: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
      flexGrow: 1,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    brandMark: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    brand: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text.primary,
    },
    body: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.text.secondary,
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    label: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: 16,
      color: colors.text.primary,
    },
    codeInput: {
      fontSize: 26,
      letterSpacing: 10,
      textAlign: "center",
      fontWeight: "700",
    },
    hint: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    error: {
      fontSize: 13,
      color: colors.semantic.error,
      marginBottom: spacing.md,
    },
    secondaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.lg,
    },
    link: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.primary,
    },
    spinner: {
      marginTop: spacing.lg,
    },
  });
}
