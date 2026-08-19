import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as Sentry from "@sentry/react-native";
import { db } from "../db/client";
import migrations from "../db/migrations/migrations";
import { SyncProvider, useSyncStatus } from "../sync/SyncContext";
import { NetworkStatusProvider } from "../sync/NetworkStatusContext";
import { SyncProgressScreen } from "../sync/SyncProgressScreen";
import { SyncBanner } from "../sync/SyncBanner";
import { OfflineBanner } from "../sync/OfflineBanner";
import { SessionHistoryProvider } from "../practice/sessionHistory";
import { BookmarksProvider } from "../practice/bookmarks";
import { AppLanguageProvider } from "../practice/appLanguage";
import { AuthProvider } from "../practice/authContext";
import { STACK_SCREEN_OPTIONS } from "../ui/navigation";
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

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Text>Database migration failed: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Setting up local database...</Text>
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
                <RootNavigator />
              </AppLanguageProvider>
            </BookmarksProvider>
          </SessionHistoryProvider>
        </AuthProvider>
      </SyncProvider>
    </NetworkStatusProvider>
  );
}

function RootNavigator() {
  const { status } = useSyncStatus();
  useScreenViewTracking();

  if (status === "checking" || status === "syncing") {
    return <SyncProgressScreen />;
  }

  return (
    <>
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="revise" options={{ title: "Revise" }} />
        <Stack.Screen name="account" options={{ title: "Your account" }} />
      </Stack>
      <OfflineBanner />
      <SyncBanner />
    </>
  );
}

export default Sentry.wrap(RootLayout);
