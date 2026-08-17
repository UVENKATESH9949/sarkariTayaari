import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { db } from "../db/client";
import migrations from "../db/migrations/migrations";
import { SyncProvider, useSyncStatus } from "../sync/SyncContext";
import { SyncProgressScreen } from "../sync/SyncProgressScreen";
import { SyncBanner } from "../sync/SyncBanner";
import { SessionHistoryProvider } from "../practice/sessionHistory";
import { BookmarksProvider } from "../practice/bookmarks";
import { AppLanguageProvider } from "../practice/appLanguage";
import { AuthProvider } from "../practice/authContext";
import { STACK_SCREEN_OPTIONS } from "../ui/navigation";

export default function RootLayout() {
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
  );
}

function RootNavigator() {
  const { status } = useSyncStatus();

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
      <SyncBanner />
    </>
  );
}
