import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { useAuth } from "../practice/authContext";
import { useNetworkStatus } from "../sync/NetworkStatusContext";
import { AppAlert } from "../ui/AppDialog";
import { Button } from "../ui/Button";
import { CardSkeleton } from "../ui/Skeleton";
import { colors, radius, spacing } from "../ui/theme";

/**
 * Sign in / sign up, and the signed-in account view.
 *
 * Deliberately reached from More rather than shown at launch: an account is optional,
 * and a sign-up wall before the student has seen any value is where people leave.
 */
export default function Account() {
  const router = useRouter();
  const { user, loading, syncing, signIn, signUp, signOut } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.container}>
        <CardSkeleton height={140} />
      </View>
    );
  }

  /* ------------------------------------------------------------ signed in view */

  if (user) {
    const handleSignOut = () => {
      AppAlert.alert(
        "Sign out?",
        "Your progress is saved to your account first. It stays on this phone too.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign out",
            style: "destructive",
            onPress: async () => {
              setBusy(true);
              try {
                await signOut();
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    };

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={26} color={colors.text.onAccent} />
          </View>
          <Text style={styles.name}>{user.displayName || "Signed in"}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <View style={styles.statusRow}>
          {syncing ? (
            <>
              <ActivityIndicator size="small" color={colors.brand.primary} />
              <Text style={styles.statusText}>Saving your progress…</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={colors.semantic.success} />
              <Text style={styles.statusText}>Progress is backed up to your account</Text>
            </>
          )}
        </View>

        <Text style={styles.explainer}>
          Your practice sessions and mock tests are saved to this account. If you lose this
          phone, sign in on a new one and your history comes back.
        </Text>

        <Button variant="danger" size="lg" disabled={busy} onPress={handleSignOut} style={styles.secondaryButton}>
          {busy ? "Signing out…" : "Sign out"}
        </Button>
      </ScrollView>
    );
  }

  /* ----------------------------------------------------------- signed out view */

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    // Signing in/up needs the server, unlike everything else in this app — worth
    // saying so up front rather than letting the request fail with a raw network error.
    if (isOnline === false) {
      setError("You're offline. Connect to the internet to sign in.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") await signUp(email.trim(), password, displayName.trim() || undefined);
      else await signIn(email.trim(), password);
      router.back();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>
          {mode === "signup" ? "Save your progress" : "Welcome back"}
        </Text>
        <Text style={styles.subheading}>
          {mode === "signup"
            ? "Create an account so your practice history survives losing or changing your phone."
            : "Sign in to bring your practice history onto this phone."}
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {mode === "signup" && (
          <View style={styles.field}>
            <Text style={styles.label}>Your name (optional)</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Venkatesh"
              autoCapitalize="words"
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <Button size="lg" disabled={busy} loading={busy} onPress={submit} style={styles.primaryButton}>
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>

        <Pressable onPress={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }}>
          <Text style={styles.switchText}>
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </Text>
        </Pressable>

        <Text style={styles.footnote}>
          You can keep practising without an account — this only backs your progress up.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing["3xl"] },
  heading: { fontSize: 22, fontWeight: "700", color: colors.text.primary },
  subheading: { marginTop: spacing.sm - 2, marginBottom: spacing.xl, fontSize: 13.5, color: colors.text.muted, lineHeight: 19 },
  field: { marginBottom: spacing.base },
  label: { fontSize: 12.5, fontWeight: "600", color: colors.text.secondary, marginBottom: spacing.sm - 2 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md, fontSize: 15, backgroundColor: colors.surfaceElevated, color: colors.text.primary,
  },
  primaryButton: { marginTop: spacing.sm },
  secondaryButton: { marginTop: spacing["2xl"] },
  switchText: { marginTop: spacing.lg - 2, textAlign: "center", color: colors.brand.primary, fontSize: 14, fontWeight: "600" },
  footnote: { marginTop: spacing.xl + 2, textAlign: "center", color: colors.text.muted, fontSize: 12.5, lineHeight: 18 },
  errorBox: { backgroundColor: colors.semantic.errorBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.base },
  errorText: { color: colors.semantic.error, fontSize: 13.5 },
  card: { alignItems: "center", paddingVertical: spacing.xl },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand.primary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md + 2,
  },
  name: { fontSize: 18, fontWeight: "700", color: colors.text.primary },
  email: { fontSize: 13.5, color: colors.text.muted, marginTop: spacing.xs },
  statusRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceElevated2,
    borderRadius: radius.md, padding: spacing.md + 2,
  },
  statusText: { fontSize: 13.5, color: colors.text.secondary, flex: 1 },
  explainer: { marginTop: spacing.base, fontSize: 13, color: colors.text.muted, lineHeight: 19 },
});
