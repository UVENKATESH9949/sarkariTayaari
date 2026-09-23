import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import * as Sentry from "@sentry/react-native";
import { configureApi } from "@sarkaritaiyaari/core/api";
import { API_BASE_URL } from "../api/config";
import { db } from "../db/client";
import migrations from "../db/migrations/migrations";
import { SyncProvider } from "../sync/SyncContext";
import { NetworkStatusProvider } from "../sync/NetworkStatusContext";
import { NetworkStatusToast } from "../sync/NetworkStatusToast";
import { SessionHistoryProvider } from "../practice/sessionHistory";
import { BookmarksProvider } from "../practice/bookmarks";
import { AppLanguageProvider } from "../practice/appLanguage";
import { AuthProvider } from "../practice/authContext";
import { ActiveSessionProvider } from "../practice/activeSessionContext";
import { ActiveExamProvider } from "../examsModule/activeExamContext";
import { ExamSwitchOverlay } from "../examsModule/ExamSwitchOverlay";
import { OnboardingProvider } from "../onboarding/OnboardingContext";
import { AppStartGate } from "../onboarding/AppStartGate";
import { I18nProvider, useT } from "../i18n/I18nContext";
import { AppDialogHost } from "../ui/AppDialog";
import { stackScreenOptions } from "../ui/navigation";
import { ThemeProvider, useTheme } from "../ui/ThemeContext";
import { lightPalette } from "../ui/palettes";
import { useScreenViewTracking } from "../telemetry/analytics";

// Module scope, before anything renders — including the migration-loading/error
// screens below, which happen before any provider mounts. If EXPO_PUBLIC_SENTRY_DSN
// is unset (e.g. a contributor without their own .env.local), the SDK initializes
// but sends nothing, which is Sentry's own documented behavior for a missing dsn.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? "development" : "production",
});

// Also module scope, and for the same reason: the shared API client in
// @sarkaritaiyaari/core deliberately has no default base URL — mobile derives one from Expo's
// hostUri, web reads a Vite env var — so it must be told before the first request. Doing it
// here rather than as an import side effect keeps it visible; expo-router loads this file
// before any screen, so nothing can call the API ahead of it.
configureApi({ baseUrl: API_BASE_URL });

function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  /*
   * Inter, loaded once for the whole app — a font has to be registered before any screen
   * that names it renders, and this is the only file above every screen.
   *
   * Four faces, imported one subpath at a time rather than from the package root: the
   * root re-exports all eighteen weights plus italics, and Metro would bundle every TTF
   * into the APK for the four we use. See `ui/fonts.ts` for why each weight is its own
   * family name.
   *
   * THIS IS GATED, and the first version was not — the emulator is what settled it. React
   * Navigation's bottom tab bar measures each label once and sizes the item from that
   * measurement; rendering before the faces registered meant the first two tabs were
   * measured in the platform font, re-rendered wider in Inter, and stayed ellipsised
   * ("Ho...", "Practi...") for the life of the process while the other three were fine.
   * Any component that measures text once has the same exposure, so the fix belongs here
   * rather than in the tab bar.
   *
   * It costs nothing against this project's "never block the app opening" rule: these are
   * bundled assets with no network, and they load in parallel with the SQLite migration
   * below, which is slower and already gates. The screen shown while waiting is the
   * migration's own.
   */
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // These two screens render BEFORE ThemeProvider exists, and they cannot be themed:
  // the theme preference lives in the same database whose migrations are the thing
  // that has not finished (or has failed). They stay on the light palette explicitly,
  // which is also the app's default, so a dark-mode user sees one light frame at worst
  // and — in the error case — a legible message rather than a blank screen.
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: lightPalette.bg }}>
        <Text style={{ color: lightPalette.text.primary }}>Database migration failed: {error.message}</Text>
      </View>
    );
  }

  // `fontError` releases the gate rather than holding it: a font that genuinely failed to
  // load is a cosmetic problem, and trapping the student on a loading screen over one would
  // be far worse than rendering in the platform's own sans-serif.
  if (!success || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: lightPalette.bg }}>
        <Text style={{ color: lightPalette.text.secondary }}>Setting up local database...</Text>
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
                    {/* Below SyncProvider and AuthProvider because it reacts to both: a sync
                        can auto-follow an exam and signing in can restore follows made on
                        another device, and neither goes through this provider's mutators. */}
                    <ActiveExamProvider>
                      {/* Below ActiveExamProvider because finishing onboarding follows and
                          activates the exam it just asked for, through that provider's own
                          operation rather than a second copy of it. */}
                      <OnboardingProvider>
                        {/* Innermost: only the tab bar and the quiz/test screens need this, and
                            neither depends on sync/auth/session-history state. */}
                        <ActiveSessionProvider>
                          <AppStartGate>
                            <RootNavigator />
                          </AppStartGate>
                        </ActiveSessionProvider>
                      </OnboardingProvider>
                      {/* Beside the dialog host in spirit: mounted once, at the root, so the
                          switching transition covers the tab bar as well as the screen. */}
                      <ExamSwitchOverlay />
                      {/* Above the gate, not inside the navigator: onboarding's "leave setup?"
                          confirmation renders before any screen exists, and AppAlert routes
                          through whichever host is mounted. There is still exactly one. */}
                      <AppDialogHost />
                    </ActiveExamProvider>
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
    </>
  );
}

export default Sentry.wrap(RootLayout);
