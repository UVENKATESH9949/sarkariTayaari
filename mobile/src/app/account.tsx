import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
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
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  /* ------------------------------------------------------------ signed in view */

  if (user) {
    const handleSignOut = () => {
      Alert.alert(
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
            <Ionicons name="person" size={26} color="#ffffff" />
          </View>
          <Text style={styles.name}>{user.displayName || "Signed in"}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <View style={styles.statusRow}>
          {syncing ? (
            <>
              <ActivityIndicator size="small" />
              <Text style={styles.statusText}>Saving your progress…</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#2f9e64" />
              <Text style={styles.statusText}>Progress is backed up to your account</Text>
            </>
          )}
        </View>

        <Text style={styles.explainer}>
          Your practice sessions and mock tests are saved to this account. If you lose this
          phone, sign in on a new one and your history comes back.
        </Text>

        <Pressable
          disabled={busy}
          onPress={handleSignOut}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{busy ? "Signing out…" : "Sign out"}</Text>
        </Pressable>
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

        <Pressable
          disabled={busy}
          onPress={submit}
          style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && !busy && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </Text>
        </Pressable>

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
  container: { padding: 20, paddingTop: 24, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 22, fontWeight: "700", color: "#1a2b4a" },
  subheading: { marginTop: 6, marginBottom: 24, fontSize: 13.5, color: "#8a94a6", lineHeight: 19 },
  field: { marginBottom: 16 },
  label: { fontSize: 12.5, fontWeight: "600", color: "#5a6a85", marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#e3e8f0", borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, backgroundColor: "#ffffff", color: "#1a2b4a",
  },
  primaryButton: {
    backgroundColor: "#208AEF", borderRadius: 12, paddingVertical: 15,
    alignItems: "center", marginTop: 8,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    borderWidth: 1, borderColor: "#e3e8f0", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginTop: 24,
  },
  secondaryButtonText: { color: "#c94f4f", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  switchText: { marginTop: 18, textAlign: "center", color: "#208AEF", fontSize: 14, fontWeight: "600" },
  footnote: { marginTop: 22, textAlign: "center", color: "#8a94a6", fontSize: 12.5, lineHeight: 18 },
  errorBox: { backgroundColor: "#fdecec", borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: "#c94f4f", fontSize: 13.5 },
  card: { alignItems: "center", paddingVertical: 24 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: "#208AEF",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  name: { fontSize: 18, fontWeight: "700", color: "#1a2b4a" },
  email: { fontSize: 13.5, color: "#8a94a6", marginTop: 4 },
  statusRow: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f5f7fb",
    borderRadius: 10, padding: 14,
  },
  statusText: { fontSize: 13.5, color: "#5a6a85", flex: 1 },
  explainer: { marginTop: 16, fontSize: 13, color: "#8a94a6", lineHeight: 19 },
});
