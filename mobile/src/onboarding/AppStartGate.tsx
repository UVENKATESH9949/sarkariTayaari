import { useEffect, type ReactNode } from "react";
import { Text, View } from "react-native";
import { SignInFlow } from "../auth/SignInFlow";
import { useAuth } from "../practice/authContext";
import { useSyncStatus } from "../sync/SyncContext";
import { useT } from "../i18n/I18nContext";
import { LoadingMark } from "../ui/LoadingMark";
import { PreparingApp } from "../ui/PreparingApp";
import { useTheme } from "../ui/ThemeContext";
import { OnboardingFlow } from "./OnboardingFlow";
import { PreparingProfile } from "./PreparingProfile";
import { useOnboarding } from "./OnboardingContext";
import { startupLog } from "../telemetry/startupLog";

/**
 * The flow, plus one log line when it actually reaches the screen. "Onboarding was decided" and
 * "onboarding was shown" are different facts, and only the second proves a returning student was
 * (or was not) shown step 1 — which is exactly what the reinstall test needs to see.
 */
function OnboardingScreen() {
  useEffect(() => {
    startupLog("ONBOARDING_SHOWN");
  }, []);
  return <OnboardingFlow />;
}

/**
 * The single decision about what the app shows before the navigator mounts.
 *
 * This replaces the old `FirstLaunchGate`, which only knew about the first-ever sync. Folding
 * both questions into one component is what stops the two preparation screens stacking: with
 * separate gates, a student finishing onboarding inside the sync's 5-second window would be
 * handed straight from the personalised warm-up to the generic one.
 *
 * In order:
 *
 * | Condition | Shown |
 * |---|---|
 * | Still reading the stored session, or working out whether onboarding is owed | a bare themed background |
 * | **Nobody is signed in** | **the sign-in flow** |
 * | Onboarding looks owed, but a sign-in is still restoring the account | "Restoring your account" |
 * | Onboarding is owed | the flow |
 * | Onboarding just finished | the personalised warm-up |
 * | A genuinely first-ever sync is still short of usable | the existing preparation screen |
 * | Otherwise | the app |
 *
 * The first row is a plain `View`, not a spinner: it lasts one database read, and anything
 * more elaborate would flash on every launch a returning user makes.
 *
 * **A returning user never leaves the last row.** The onboarding phase starts as `resolving`
 * and goes straight to `ready`, so nothing here is new work on a normal launch.
 *
 * <h2>Sign-in comes before onboarding, and that is a reversal</h2>
 * This app was built so an account was optional — onboarding ran first and everything worked
 * signed out. **The project owner asked on 2026-09-21 for an account to be required**, so the
 * sign-in row sits above onboarding: a student identifies themselves, and only then is asked
 * about their exam and study time. That ordering also means the profile those questions produce
 * belongs to an account from the moment it exists, instead of being device-local until someone
 * happens to sign in.
 *
 * The signed-out code paths beneath were deliberately NOT removed. They remain correct, a token
 * can still expire mid-use and drop a student back here, and deleting them would be a large,
 * risky change for no gain.
 */
export function AppStartGate({ children }: { children: ReactNode }) {
  const { phase, checkingAccount } = useOnboarding();
  const { user, loading: authLoading, restoringAccount } = useAuth();
  const t = useT();
  const { firstLaunchSyncActive } = useSyncStatus();
  const { colors, typography } = useTheme();

  // Both reads are local and fast. Waiting for the session too stops a signed-in returning user
  // seeing the sign-in screen flash before their stored token has been read back.
  if (authLoading || phase === "resolving") {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  if (!user) {
    return <SignInFlow />;
  }
  // A sign-in just succeeded and the account is still coming back. On a reinstall or a new phone
  // this is where the server says "onboarding was already done" — deciding before it lands would
  // show step 1 to someone who finished it months ago. Bounded in authContext (RESTORE_WAIT_MS).
  if (phase === "collecting" && (restoringAccount || checkingAccount)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 24 }}>
        <LoadingMark label={t("common.preparing")} size="hero" />
        <Text style={[typography.secondary, { textAlign: "center" }]}>{t("prepare.restoringAccount")}</Text>
      </View>
    );
  }
  if (phase === "collecting") {
    return <OnboardingScreen />;
  }
  if (phase === "preparing") {
    return <PreparingProfile />;
  }
  if (firstLaunchSyncActive) {
    return <PreparingApp />;
  }
  return <>{children}</>;
}
