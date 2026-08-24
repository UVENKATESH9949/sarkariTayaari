import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Alert } from "react-native";
import { useActiveSession, type TabHref } from "../../practice/activeSessionContext";
import { colors } from "../../ui/theme";

const ACTIVE_COLOR = colors.brand.light;
const INACTIVE_COLOR = colors.text.muted;

// Route name -> href, for the destination handoff described below.
const TAB_HREFS: Record<string, TabHref> = {
  index: "/",
  practice: "/practice",
  "mock-test": "/mock-test",
  progress: "/progress",
  more: "/more",
};

export default function TabsLayout() {
  const { activeSessionRef, abandonSession, pendingDestinationRef } = useActiveSession();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
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
          Alert.alert(
            "Leave this test?",
            "You are moving to another module. Your current test state may be lost if you leave now.",
            [
              { text: "Stay", style: "cancel" },
              {
                text: "Leave",
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
          title: "Home",
          tabBarLabel: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: "Practice",
          tabBarLabel: "Practice",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "book" : "book-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mock-test"
        options={{
          title: "Mock Test",
          tabBarLabel: "Mock Test",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "timer" : "timer-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarLabel: "Progress",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarLabel: "More",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "ellipsis-horizontal-circle" : "ellipsis-horizontal-circle-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
