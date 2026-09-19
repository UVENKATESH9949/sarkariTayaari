import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { getExamGuideHybrid } from "../data/examGuideData";
import { useHybridMode } from "../data/hybridSource";
import { getPriorityTopics } from "../db/topicIntelligence";
import { useActiveExam } from "../examsModule/activeExamContext";
import { useAppLanguage } from "../practice/appLanguage";
import { useSyncStatus } from "../sync/SyncContext";
import { useT } from "../i18n/I18nContext";
import { LoadingMark } from "../ui/LoadingMark";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useOnboarding } from "./OnboardingContext";

/**
 * The personalised warm-up, shown once, between the last onboarding answer and Home.
 *
 * ## Every line on this screen is a real step
 *
 * The brief asks for the existing "preparing your data" pause to become meaningful rather than
 * decorative, and is explicit that progress must not claim something happened when it did not.
 * So the checklist is the work, not a description of it:
 *
 *   1. **Saving your preferences** — already done by `submit()` before this screen mounted.
 *      Shown as complete from the first frame, because it genuinely is.
 *   2. **Setting up your exam** — follows the chosen exam and makes it active. Skipped, not
 *      faked, when onboarding finished with no exam (an offline first launch).
 *   3. **Preparing your subjects and practice content** — waits for the reference sync that has
 *      been running behind the flow. Usually already done by now; this is where a slow network
 *      is actually absorbed.
 *   4. **Preparing your dashboard** — warms the exam guide and the priority topics Home reads,
 *      so the first Home render has data rather than three skeletons.
 *
 * A step that cannot run is not ticked. A step that fails is still ticked, deliberately: every
 * one of these is best-effort warming whose own screen already handles absence, and leaving a
 * permanently-unticked row would strand the student on this screen over a prefetch.
 *
 * ## The one timer
 *
 * The welcome message holds for {@link WELCOME_MS} after the work is done. That is a deliberate
 * beat, not padding disguised as progress — the work has finished and the screen says so.
 */

/** How long the welcome greeting holds before Home. Long enough to read one line, short enough not to be a screen. */
const WELCOME_MS = 1600;

/** Guards against a broken/never-resolving sync leaving someone here. Never reached in normal use. */
const WORK_CEILING_MS = 12000;

type StepState = "pending" | "active" | "done" | "skipped";

function ChecklistRow({ label, state }: { label: string; state: StepState }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const done = state === "done";
  const active = state === "active";
  return (
    <View style={styles.row}>
      <Ionicons
        name={done ? "checkmark-circle" : "ellipse-outline"}
        size={18}
        color={done ? colors.semantic.success : active ? colors.brand.light : colors.text.muted}
      />
      <Text style={[styles.rowLabel, !done && !active && styles.rowLabelMuted]}>{label}</Text>
    </View>
  );
}

export function PreparingProfile() {
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const { displayName, draft, finish } = useOnboarding();
  const { addExam, setActiveExam } = useActiveExam();
  const { refresh: refreshContentLanguages } = useAppLanguage();
  const { firstLaunchSyncActive } = useSyncStatus();
  const mode = useHybridMode();

  const [examState, setExamState] = useState<StepState>("active");
  const [contentState, setContentState] = useState<StepState>("pending");
  const [dashboardState, setDashboardState] = useState<StepState>("pending");
  const [showWelcome, setShowWelcome] = useState(false);

  // The whole sequence runs once. The sync state changes underneath it while it runs, and
  // re-running would re-follow the exam on every tick.
  const started = useRef(false);
  // Read inside the loop below without making it a dependency — same reason SyncContext keeps
  // `isOnlineRef`: this effect is set up once and must see the latest value, not the mounted one.
  const preparingRef = useRef(firstLaunchSyncActive);
  useEffect(() => {
    preparingRef.current = firstLaunchSyncActive;
  }, [firstLaunchSyncActive]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    (async () => {
      const deadline = Date.now() + WORK_CEILING_MS;

      // The content-language provider sits above onboarding in the tree, so it read an empty
      // selection before the student had answered. Telling it to re-read is what makes the
      // choice reach the quiz in this session rather than only after the next app start.
      await refreshContentLanguages().catch((err) =>
        console.warn("Failed to refresh content languages", err),
      );

      // 2. The exam.
      if (draft.primaryExamCode) {
        try {
          await addExam(draft.primaryExamCode);
          // Silent: this screen is already the progress UI, and the switching overlay exists to
          // cover a dashboard being swapped out. There is no previous dashboard here.
          await setActiveExam(draft.primaryExamCode, { silent: true });
        } catch (err) {
          console.warn("Failed to set the onboarding exam", err);
        }
        if (cancelled) return;
        setExamState("done");
      } else {
        // No exam was chosen, because there was nothing to choose from. Nothing is claimed.
        setExamState("skipped");
      }
      setContentState("active");

      // 3. Reference data — waited on through the SAME signal the startup gate releases on, not a
      // similar-looking one. That is what stops the generic preparation screen appearing for a
      // frame after this one: by the time this loop exits, that gate is already open.
      while (preparingRef.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (cancelled) return;
      }
      setContentState("done");
      setDashboardState("active");

      // 4. Warm what Home reads first. allSettled: each of these is an enhancement whose own
      // screen renders correctly without it, so a failure must not hold the student here.
      if (draft.primaryExamCode) {
        await Promise.allSettled([
          getExamGuideHybrid(draft.primaryExamCode, mode),
          getPriorityTopics(draft.primaryExamCode, 4),
        ]);
      }
      if (cancelled) return;
      setDashboardState("done");
      setShowWelcome(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [draft.primaryExamCode, addExam, setActiveExam, mode, refreshContentLanguages]);

  // The welcome beat, and then the app.
  useEffect(() => {
    if (!showWelcome) return;
    const id = setTimeout(finish, WELCOME_MS);
    return () => clearTimeout(id);
  }, [showWelcome, finish]);

  if (showWelcome) {
    return (
      <View style={styles.screen}>
        <Animated.View entering={FadeIn.duration(320)} style={styles.welcomeBlock}>
          <Text style={styles.welcomeGreeting}>
            {/* Never a hardcoded name: this is what they typed on step 1, normalised. */}
            {t("onboarding.welcome.greeting", { name: displayName ?? "" })}
          </Text>
          <Text style={styles.welcomeLine}>{t("onboarding.welcome.line1")}</Text>
          <Text style={styles.welcomeLine}>{t("onboarding.welcome.line2")}</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <LoadingMark label={t("common.preparing")} size="hero" />
      </View>

      <Text style={styles.title}>{t("onboarding.preparing.title")}</Text>
      <Text style={styles.subtitle}>{t("onboarding.preparing.subtitle")}</Text>

      <View style={styles.checklist}>
        {/* Already true when this screen mounts — submit() persisted the profile before it did. */}
        <ChecklistRow label={t("onboarding.preparing.savingProfile")} state="done" />
        {examState !== "skipped" && (
          <ChecklistRow label={t("onboarding.preparing.settingUpExam")} state={examState} />
        )}
        <ChecklistRow label={t("onboarding.preparing.waitingForContent")} state={contentState} />
        <ChecklistRow label={t("onboarding.preparing.buildingDashboard")} state={dashboardState} />
      </View>
    </View>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    hero: {
      marginBottom: spacing["2xl"],
    },
    title: {
      ...typography.pageTitle,
      fontSize: 22,
      textAlign: "center",
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.secondary,
      textAlign: "center",
      marginBottom: spacing["2xl"],
    },
    checklist: {
      width: "100%",
      gap: spacing.sm + 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    rowLabel: {
      ...typography.body,
      flex: 1,
    },
    rowLabelMuted: {
      color: colors.text.muted,
    },
    welcomeBlock: {
      alignItems: "center",
      gap: spacing.md,
    },
    welcomeGreeting: {
      ...typography.pageTitle,
      textAlign: "center",
    },
    welcomeLine: {
      ...typography.body,
      color: colors.text.secondary,
      textAlign: "center",
    },
  });
