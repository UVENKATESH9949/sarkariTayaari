import type { ReactNode } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as Sentry from "@sentry/react-native";
import { db } from "../db/client";
import migrations from "../db/migrations/migrations";
import { SyncProvider, useSyncStatus } from "../sync/SyncContext";
import { NetworkStatusProvider } from "../sync/NetworkStatusContext";
import { NetworkStatusToast } from "../sync/NetworkStatusToast";
import { SessionHistoryProvider } from "../practice/sessionHistory";
import { BookmarksProvider } from "../practice/bookmarks";
import { AppLanguageProvider } from "../practice/appLanguage";
import { AuthProvider } from "../practice/authContext";
import { ActiveSessionProvider } from "../practice/activeSessionContext";
import { I18nProvider, useT } from "../i18n/I18nContext";
import { PreparingApp } from "../ui/PreparingApp";
import { AppDialogHost } from "../ui/AppDialog";
import { stackScreenOptions } from "../ui/navigation";
import { ThemeProvider, useTheme } from "../ui/ThemeContext";
import { darkPalette } from "../ui/palettes";
import { useScreenViewTracking } from "../telemetry/analytics";

// Module scope, before anything renders — including the migration-loading/error
// screens below, which happen before any provider mounts. If EXPO_PUBLIC_SENTRY_DSN
// is unset (e.g. a contributor without their own .env.local), the SDK initializes
// but sends nothing, which is Sentry's own documented behavior for a missing dsn.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? "development" : "production",
});

function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  // These two screens render BEFORE ThemeProvider exists, and they cannot be themed:
  // the theme preference lives in the same database whose migrations are the thing
  // that has not finished (or has failed). They stay on the dark palette explicitly,
  // which is also the app's default, so a light-mode user sees one dark frame at worst
  // and — in the error case — a legible message rather than a blank screen.
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: darkPalette.bg }}>
        <Text style={{ color: darkPalette.text.primary }}>Database migration failed: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: darkPalette.bg }}>
        <Text style={{ color: darkPalette.text.secondary }}>Setting up local database...</Text>
      </View>
    );
  }

  return (
    // Outermost of the providers: every other provider's UI (the sync toast, the dialog
    // host, the first-launch screen) is themed, and I18nProvider reads the same
    // preferences row, so both sit above everything that renders text.
    <ThemeProvider>
      <I18nProvider>
        <NetworkStatusProvider>
          <SyncProvider>
            {/* Outside SessionHistory/Bookmarks: signing in restores history into SQLite,
                which those providers then read on their own next load. */}
            <AuthProvider>
              <SessionHistoryProvider>
                <BookmarksProvider>
                  <AppLanguageProvider>
                    {/* Innermost: only the tab bar and the quiz/test screens need this, and
                        neither depends on sync/auth/session-history state. */}
                    <ActiveSessionProvider>
                      <FirstLaunchGate>
                        <RootNavigator />
                      </FirstLaunchGate>
                    </ActiveSessionProvider>
                  </AppLanguageProvider>
                </BookmarksProvider>
              </SessionHistoryProvider>
            </AuthProvider>
          </SyncProvider>
        </NetworkStatusProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

/** Shows the first-launch preparation screen instead of the app until a genuinely first-ever sync reaches a usable state — see SyncContext's firstLaunchSyncActive. */
function FirstLaunchGate({ children }: { children: ReactNode }) {
  const { firstLaunchSyncActive } = useSyncStatus();
  if (firstLaunchSyncActive) {
    return <PreparingApp />;
  }
  return <>{children}</>;
}

function RootNavigator() {
  useScreenViewTracking();
  const { colors, mode } = useTheme();
  const t = useT();

  return (
    <>
      {/* Follows the app's theme, not the OS's. app.json sets userInterfaceStyle
          "automatic", which would leave a light-mode phone with dark status-bar icons
          over a dark app header (or the reverse) once the in-app toggle disagrees with
          the system setting. */}
      <StatusBar style={mode === "light" ? "dark" : "light"} />
      <Stack screenOptions={stackScreenOptions(colors)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="revise" options={{ title: t("nav.revise") }} />
        <Stack.Screen name="account" options={{ title: t("nav.account") }} />
        <Stack.Screen name="settings" options={{ title: t("nav.settings") }} />
        <Stack.Screen name="exam-guide" options={{ title: t("nav.examGuide") }} />
        <Stack.Screen name="my-exams" options={{ title: "My Exams" }} />
        <Stack.Screen name="eligibility-checker" options={{ title: "Check My Eligibility" }} />
        <Stack.Screen name="exam-guide-history" options={{ title: "Notification History" }} />
        <Stack.Screen name="exam-compare" options={{ title: "Compare Exams" }} />
        <Stack.Screen name="diagnostic-test" options={{ title: "Diagnostic Test" }} />
        <Stack.Screen name="diagnostic-result" options={{ title: "Diagnostic Results", headerBackVisible: false }} />
      </Stack>
      <NetworkStatusToast />
      <AppDialogHost />
    </>
  );
}

export default Sentry.wrap(RootLayout);
