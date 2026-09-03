import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useActiveSession, type TabHref } from "../../practice/activeSessionContext";
import { AppAlert } from "../../ui/AppDialog";
import { useTheme } from "../../ui/ThemeContext";
import { useT } from "../../i18n/I18nContext";

// Route name -> href, for the destination handoff described below.
const TAB_HREFS: Record<string, TabHref> = {
  index: "/",
  practice: "/practice",
  "mock-test": "/mock-test",
  exams: "/exams",
  progress: "/progress",
  more: "/more",
};

export default function TabsLayout() {
  const { colors } = useTheme();
  const t = useT();
  const { activeSessionRef, abandonSession, pendingDestinationRef } = useActiveSession();

  return (
    <Tabs
      /*
       * The fix for Doc 2 §4's back-traversal, and the reason it was happening.
       *
       * The default here walks the *tab history*, so Back from a third module went to Mock,
       * then continued popping Mock's stack, then landed in whatever Practice screen was
       * still mounted — producing exactly the reported
       * "Other Module -> Mock -> Practice Test -> Practice Level -> Practice Home" chain.
       * Nothing was leaking; that is what tab history does.
       *
       * "initialRoute" makes Back from any tab go to Home and then exit the app, so it can
       * never cross from one module into another's stack. Combined with the idle collapse in
       * useStaleStackReset, a module is also not still four screens deep when revisited.
       */
      backBehavior="initialRoute"
      screenOptions={{
        tabBarActiveTintColor: colors.brand.light,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        // Tabs has its own background prop, separate from Stack's `contentStyle` —
        // without this each tab's scene falls back to the OS default light background.
        sceneStyle: { backgroundColor: colors.bg },
      }}
      // Only fires while a Practice quiz or Mock Test is actually in progress
      // (see activeSessionContext) — plain browsing between tabs stays silent.
      screenListeners={({ route }) => ({
        tabPress: (e) => {
          if (!activeSessionRef.current) return;
          e.preventDefault();
          AppAlert.alert(
            t("session.leaveTestTitle"),
            t("session.leaveTestMessage"),
            [
              { text: t("common.stay"), style: "cancel" },
              {
                text: t("common.leave"),
                style: "destructive",
                onPress: () => {
                  // Don't navigate here: the abandoned screen still needs to fix up
                  // its own stack first (router.replace() to its own first route,
                  // triggered by resetSignal below), and calling navigate() to the
                  // destination tab before that finishes gets clobbered when that
                  // fixup runs — it's the same router, so whichever replace() call
                  // lands second wins the tab focus. Stash the destination instead;
                  // the owning screen (test.tsx/quiz.tsx) completes the trip itself
                  // once its own fixup is done.
                  pendingDestinationRef.current = TAB_HREFS[route.name] ?? "/";
                  abandonSession();
                },
              },
            ],
          );
        },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.home"),
          tabBarLabel: t("nav.home"),
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: t("nav.practice"),
          tabBarLabel: t("nav.practice"),
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "book" : "book-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mock-test"
        options={{
          title: t("nav.mockTest"),
          tabBarLabel: t("nav.mockTest"),
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "timer" : "timer-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="exams"
        options={{
          title: t("nav.exams"),
          tabBarLabel: t("nav.exams"),
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "school" : "school-outline"} size={size} color={color} />
          ),
        }}
      />
      {/*
        Exam Guide spec §39/§65/§72: Progress stays a real route (so Home's readiness card and
        More's row below can still push to it, and its own screen/data/calculations are
        completely untouched) but is no longer a primary tab. `href: null` is expo-router's
        documented way to do exactly that — the route keeps working, the tab bar just stops
        listing it.
      */}
      <Tabs.Screen
        name="progress"
        options={{
          title: t("nav.progress"),
          tabBarLabel: t("nav.progress"),
          headerShown: false,
          href: null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("nav.more"),
          tabBarLabel: t("nav.more"),
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "ellipsis-horizontal-circle" : "ellipsis-horizontal-circle-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
