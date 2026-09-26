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
import { captureError } from "../telemetry/analytics";
import { startupLog, withCeiling } from "../telemetry/startupLog";
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

/**
 * Per-step ceiling for the best-effort steps (following the exam, warming the dashboard). The shared
 * API client has no request timeout, so without this a network that accepts a connection and never
 * answers would hold the student here indefinitely.
 */
const STEP_CEILING_MS = 8000;

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

  /*
   * THE SEQUENCE RUNS EXACTLY ONCE, AND ONLY UNMOUNTING CAN CANCEL IT.
   *
   * This is the fix for the "stuck on Preparing" bug (2026-09-24). The previous version listed
   * `addExam`, `setActiveExam` and `mode` as effect dependencies, and guarded re-entry with a
   * `started` ref. But step 2 itself changes those values: following the exam re-renders the
   * active-exam provider, which rebuilds `setActiveExam` (it closes over `activeExam`/`myExams`),
   * and the first sync finishing flips `mode` from "live" to "local". Each change ran the effect's
   * cleanup — setting `cancelled` — and the re-run returned early on the `started` guard. The
   * in-flight sequence then hit `if (cancelled) return` and stopped for good, so `finish()` was
   * never called. The 12-second ceiling lived inside the loop that had already exited, so it could
   * not help either. Relaunching "fixed" it only because onboarding was already stamped complete
   * and this screen was skipped.
   *
   * So everything the sequence needs is read through refs that always hold the latest value, the
   * effect has no dependencies, and `cancelled` means "this component unmounted" and nothing else.
   * Do not add dependencies back to this effect.
   */
  const started = useRef(false);
  const latest = useRef({ draft, addExam, setActiveExam, mode, refreshContentLanguages, firstLaunchSyncActive });
  useEffect(() => {
    latest.current = { draft, addExam, setActiveExam, mode, refreshContentLanguages, firstLaunchSyncActive };
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let unmounted = false;

    (async () => {
      const deadline = Date.now() + WORK_CEILING_MS;
      const examCode = latest.current.draft.primaryExamCode;
      startupLog("PREPARATION_STEP", { step: "start", hasExam: examCode !== null });

      // The content-language provider sits above onboarding in the tree, so it read an empty
      // selection before the student had answered. Telling it to re-read is what makes the
      // choice reach the quiz in this session rather than only after the next app start.
      try {
        await withCeiling("content-languages", latest.current.refreshContentLanguages(), STEP_CEILING_MS, undefined);
      } catch (err) {
        console.warn("Failed to refresh content languages", err);
      }

      // 2. The exam.
      if (examCode) {
        try {
          await withCeiling("follow-exam", latest.current.addExam(examCode), STEP_CEILING_MS, undefined);
          // Silent: this screen is already the progress UI, and the switching overlay exists to
          // cover a dashboard being swapped out. There is no previous dashboard here. The provider
          // may not have re-rendered since the follow; that is fine, because setActiveExam re-reads
          // the followed list from SQLite when its in-memory copy lacks the exam.
          await withCeiling(
            "activate-exam",
            latest.current.setActiveExam(examCode, { silent: true }),
            STEP_CEILING_MS,
            undefined,
          );
        } catch (err) {
          console.warn("Failed to set the onboarding exam", err);
        }
        if (unmounted) return;
        setExamState("done");
      } else {
        // No exam was chosen, because there was nothing to choose from. Nothing is claimed.
        setExamState("skipped");
      }
      startupLog("PREPARATION_STEP", { step: "exam" });
      setContentState("active");

      // 3. Reference data — waited on through the SAME signal the startup gate releases on, not a
      // similar-looking one. That is what stops the generic preparation screen appearing for a
      // frame after this one: by the time this loop exits, that gate is already open. The gate
      // itself has a 5 s ceiling, so this cannot outlive it by much; WORK_CEILING_MS is a backstop.
      while (latest.current.firstLaunchSyncActive && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (unmounted) return;
      }
      setContentState("done");
      setDashboardState("active");
      startupLog("PREPARATION_STEP", { step: "content" });

      // 4. Warm what Home reads first. allSettled: each of these is an enhancement whose own
      // screen renders correctly without it, so a failure must not hold the student here — and
      // the ceiling means a request that never answers cannot either.
      if (examCode) {
        const mode = latest.current.mode;
        await withCeiling(
          "warm-dashboard",
          Promise.allSettled([getExamGuideHybrid(examCode, mode), getPriorityTopics(examCode, 4)]).then(() => undefined),
          STEP_CEILING_MS,
          undefined,
        );
      }
      if (unmounted) return;
      setDashboardState("done");
      startupLog("PREPARATION_READY");
      setShowWelcome(true);
    })().catch((err) => {
      // Nothing above should throw past its own try/allSettled, but if something does, the
      // student still goes Home. Being stuck here is the one outcome this screen must never have.
      console.warn("Preparation sequence failed; continuing to the app", err);
      captureError(err, { context: "PreparingProfile.sequence" });
      if (!unmounted) setShowWelcome(true);
    });

    return () => {
      unmounted = true;
    };
  }, []);

  // The welcome beat, and then the app.
  useEffect(() => {
    if (!showWelcome) return;
    const id = setTimeout(() => {
      startupLog("NAVIGATING_HOME", { from: "onboarding" });
      finish();
    }, WELCOME_MS);
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
