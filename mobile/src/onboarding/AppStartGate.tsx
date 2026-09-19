import type { ReactNode } from "react";
import { View } from "react-native";
import { useSyncStatus } from "../sync/SyncContext";
import { PreparingApp } from "../ui/PreparingApp";
import { useTheme } from "../ui/ThemeContext";
import { OnboardingFlow } from "./OnboardingFlow";
import { PreparingProfile } from "./PreparingProfile";
import { useOnboarding } from "./OnboardingContext";

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
 * | Still working out whether onboarding is owed | a bare themed background |
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
 */
export function AppStartGate({ children }: { children: ReactNode }) {
  const { phase } = useOnboarding();
  const { firstLaunchSyncActive } = useSyncStatus();
  const { colors } = useTheme();

  if (phase === "resolving") {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  if (phase === "collecting") {
    return <OnboardingFlow />;
  }
  if (phase === "preparing") {
    return <PreparingProfile />;
  }
  if (firstLaunchSyncActive) {
    return <PreparingApp />;
  }
  return <>{children}</>;
}
