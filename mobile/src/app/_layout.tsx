import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as Sentry from "@sentry/react-native";
import { db } from "../db/client";
import migrations from "../db/migrations/migrations";
import { SyncProvider } from "../sync/SyncContext";
import { NetworkStatusProvider } from "../sync/NetworkStatusContext";
import { OfflineBanner } from "../sync/OfflineBanner";
import { SessionHistoryProvider } from "../practice/sessionHistory";
import { BookmarksProvider } from "../practice/bookmarks";
import { AppLanguageProvider } from "../practice/appLanguage";
import { AuthProvider } from "../practice/authContext";
import { ActiveSessionProvider } from "../practice/activeSessionContext";
import { STACK_SCREEN_OPTIONS } from "../ui/navigation";
import { useScreenViewTracking } from "../telemetry/analytics";
import { colors } from "../ui/theme";

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

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.text.primary }}>Database migration failed: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <Text style={{ color: colors.text.secondary }}>Setting up local database...</Text>
      </View>
    );
  }

  return (
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
                  <RootNavigator />
                </ActiveSessionProvider>
              </AppLanguageProvider>
            </BookmarksProvider>
          </SessionHistoryProvider>
        </AuthProvider>
      </SyncProvider>
    </NetworkStatusProvider>
  );
}

function RootNavigator() {
  useScreenViewTracking();

  return (
    <>
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="revise" options={{ title: "Revise" }} />
        <Stack.Screen name="account" options={{ title: "Your account" }} />
      </Stack>
      <OfflineBanner />
    </>
  );
}

export default Sentry.wrap(RootLayout);
