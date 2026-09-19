import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DAILY_STUDY_TIMES,
  DISPLAY_NAME_MAX_LENGTH,
  MAX_CONTENT_LANGUAGES,
  PREPARATION_LEVELS,
  supportedUiLanguages,
  targetYearOptions,
  toggleContentLanguage,
  validateDisplayName,
} from "@sarkaritaiyaari/core/onboarding";
import type { UiLanguage } from "@sarkaritaiyaari/core/i18n";
import { getAvailableContentLanguages, type ContentLanguage } from "../db/contentLanguages";
import { getExamStages, type ExamStage } from "../db/examStructure";
import { getSyncedExams, type ExamOption } from "../data/practiceData";
import { useHybridMode } from "../data/hybridSource";
import { useSyncStatus } from "../sync/SyncContext";
import { useT } from "../i18n/I18nContext";
import { AnimatedProgressBar } from "../ui/AnimatedProgressBar";
import { AppAlert } from "../ui/AppDialog";
import { Button } from "../ui/Button";
import { PressableScale } from "../ui/PressableScale";
import { CardSkeleton } from "../ui/Skeleton";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";
import { useOnboarding } from "./OnboardingContext";
import { OnboardingOption } from "./OnboardingOption";

/**
 * The first-run flow: six short steps, each asking one thing.
 *
 * ## Why the steps are a list rather than six routes
 *
 * Onboarding sits *outside* the navigator — it renders in place of it (see `AppStartGate`), so
 * there is no stack to push onto. That is deliberate rather than incidental: a student halfway
 * through setup must not be able to reach Home, and the surest way to guarantee that is for
 * Home not to be mounted yet. It also means the Android Back button has exactly one meaning
 * here, which the guard below gives it.
 *
 * ## What each step is allowed to block on
 *
 * Nothing blocks on the network. The name and language steps need no data at all; the exam
 * step reads whatever the reference sync has landed so far (local, else live, else an honest
 * offline state that still lets the student continue); the stage question is skipped outright
 * unless the chosen exam genuinely has more than one stage.
 */

type StepId = "name" | "language" | "contentLanguages" | "exam" | "plan" | "level" | "time";

/**
 * `language` and `contentLanguages` are adjacent on purpose, and are two separate steps on
 * purpose. They are different questions — what language the app speaks to you in, versus what
 * language you want to study in — with different supported sets, and a student who reads an
 * English interface while practising in Telugu is an ordinary case, not an edge one. Putting
 * them side by side makes the distinction obvious; merging them would erase it.
 */
const STEPS: StepId[] = ["name", "language", "contentLanguages", "exam", "plan", "level", "time"];

/** The language's own name, in its own script — a picker entry that reads the same whichever language the app is currently in. */
const LANGUAGE_LABELS: Record<UiLanguage, string> = {
  en: "English",
  te: "తెలుగు",
};

export function OnboardingFlow() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft, submit } = useOnboarding();
  const mode = useHybridMode();
  // `phase` advances to "questions" once reference data is written; `syncVersion` covers a later
  // delta sync adding a language. Both are read here purely to re-trigger the read below.
  const { phase, syncVersion } = useSyncStatus();

  const [stepIndex, setStepIndex] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [exams, setExams] = useState<ExamOption[] | null>(null);
  const [contentLanguageOptions, setContentLanguageOptions] = useState<ContentLanguage[] | null>(null);
  /** Shown only after a tap that was actually refused, never as a standing warning. */
  const [languageLimitHit, setLanguageLimitHit] = useState(false);
  const [stages, setStages] = useState<{ examCode: string | null; list: ExamStage[] }>({
    examCode: null,
    list: [],
  });

  const step = STEPS[stepIndex];
  const currentYear = new Date().getFullYear();

  /*
   * The catalogue, loaded once when the flow opens rather than when the exam step is reached.
   * It is in flight while the student types their name, which is most of the reason the exam
   * step is normally instant on a first launch — the reference sync and these two steps
   * overlap instead of queueing.
   */
  /*
   * The synced `languages` table — the real supported-content-language list, not the mock array
   * in practice/appLanguage.tsx.
   *
   * Re-read on `phase`/`syncVersion`, NOT once on mount. Found on a device: onboarding opens
   * while the first sync is still running, so on a genuinely fresh install this table is empty
   * at mount and a one-shot read caches that emptiness forever — the student reached the step
   * online, with everything synced, and was told the languages could not be loaded. `phase`
   * flips to "questions" the moment reference data (languages included) has been written, which
   * is exactly the signal this needs.
   */
  useEffect(() => {
    let cancelled = false;
    getAvailableContentLanguages()
      .then((list) => {
        if (!cancelled) setContentLanguageOptions(list);
      })
      .catch(() => {
        if (!cancelled) setContentLanguageOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, syncVersion]);

  useEffect(() => {
    let cancelled = false;
    getSyncedExams(mode)
      .then((list) => {
        if (!cancelled) setExams(list);
      })
      .catch((err) => {
        // An empty list and a failed fetch are shown the same way, because to the student they
        // are the same thing: there is nothing to choose from, and that must not be a dead end.
        console.warn("Failed to load exams for onboarding", err);
        if (!cancelled) setExams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Stages belong to the chosen exam, so this reloads on every change of it. Keyed by exam code
  // rather than stored bare, so a stale list can never be offered for a different exam.
  useEffect(() => {
    const examCode = draft.primaryExamCode;
    // Nothing to clear when there is no exam: `stageList` below is derived by comparing the
    // stored key to the current exam, so a stale list stops being visible the moment they
    // disagree. Setting state here would be the same answer, one cascading render later.
    if (!examCode) return;
    let cancelled = false;
    getExamStages(examCode)
      .then((list) => {
        if (!cancelled) setStages({ examCode, list });
      })
      .catch(() => {
        if (!cancelled) setStages({ examCode, list: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [draft.primaryExamCode]);

  // Memoised because it feeds `advance`'s dependency list: a fresh array literal every render
  // would rebuild that callback every render for no change in value.
  const stageList = useMemo(
    () => (stages.examCode === draft.primaryExamCode ? stages.list : []),
    [stages, draft.primaryExamCode],
  );
  // One stage is not a choice — asking "Tier 1 or...?" of an exam with a single stage is a
  // question with one answer. Only a genuine fork is worth a student's tap.
  const showStageQuestion = stageList.length > 1;

  const goBack = useCallback(() => {
    setNameError(null);
    setLanguageLimitHit(false);
    setStepIndex((i) => Math.max(0, i - 1));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const confirmExit = useCallback(() => {
    AppAlert.alert(
      t("onboarding.exitTitle"),
      t("onboarding.exitMessage"),
      [
        { text: t("onboarding.exitStay"), style: "cancel" },
        // Leaving genuinely leaves — the app is backgrounded, not skipped into. Everything
        // answered so far is already in SQLite, so re-opening resumes rather than restarts.
        { text: t("onboarding.exitLeave"), style: "destructive", onPress: () => BackHandler.exitApp() },
      ],
      "warning",
    );
  }, [t]);

  /*
   * One listener covers the Back button and the Back gesture, for the same documented reason
   * `useActiveTestBackGuard` gives: `app.json` sets `predictiveBackGestureEnabled: false`, so
   * the gesture still arrives as `hardwareBackPress`. Anyone turning that flag on has to
   * revisit both files.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stepIndex > 0) {
        goBack();
      } else {
        confirmExit();
      }
      return true;
    });
    return () => subscription.remove();
  }, [stepIndex, goBack, confirmExit]);

  const canContinue = useMemo(() => {
    switch (step) {
      // Deliberately NOT disabled when the name is empty: a disabled button explains nothing,
      // and the student is owed a reason. Pressing it validates and says what is wrong.
      case "name":
        return true;
      // At least one is required when there is a list to choose from — without one there is
      // nothing to render a question in. But an EMPTY list means the catalogue has not synced,
      // and demanding a choice that cannot be made would trap the student in onboarding with no
      // way out. Same rule the exam step applies: unavailable is not invalid.
      case "contentLanguages":
        return draft.contentLanguages.length > 0 || contentLanguageOptions?.length === 0;
      case "level":
        return draft.preparationLevel !== null;
      case "time":
        return draft.dailyStudyTime !== null;
      // Language defaults to English, and both the exam and the plan step have "no answer" as a
      // legitimate outcome — an offline first launch, or an exam with nothing to ask about.
      default:
        return true;
    }
  }, [step, draft.preparationLevel, draft.dailyStudyTime, draft.contentLanguages, contentLanguageOptions]);

  const advance = useCallback(async () => {
    if (step === "name") {
      const result = validateDisplayName(draft.displayName);
      if (!result.ok) {
        setNameError(
          result.reason === "TOO_LONG"
            ? t("onboarding.name.errorTooLong", { max: DISPLAY_NAME_MAX_LENGTH })
            : t("onboarding.name.errorEmpty"),
        );
        return;
      }
      // Stored in its normalised form, so the greeting on Home renders exactly what was
      // validated rather than whatever whitespace came with it.
      updateDraft({ displayName: result.value });
      setNameError(null);
    }

    if (stepIndex < STEPS.length - 1) {
      trackEvent("onboarding_step_completed", { step });
      setStepIndex(stepIndex + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }

    setSubmitting(true);
    try {
      const result = await submit({
        availableContentLanguages: (contentLanguageOptions ?? []).map((l) => l.code),
        availableExamCodes: (exams ?? []).map((e) => e.code),
        availableStageIds: stageList.map((s) => s.id),
      });
      if (!result.ok) {
        // Unreachable in normal use — every step validates its own field — so the recovery is
        // to send the student back to the first field that is actually wrong rather than to
        // invent a message for a state that should not exist.
        const firstBadStep = STEPS.findIndex((id) => stepFieldMap[id].some((field) => field in result.errors));
        setStepIndex(firstBadStep >= 0 ? firstBadStep : 0);
      }
    } finally {
      setSubmitting(false);
    }
  }, [step, stepIndex, draft.displayName, updateDraft, submit, exams, contentLanguageOptions, stageList, t]);

  const isLast = stepIndex === STEPS.length - 1;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerTop}>
          {stepIndex > 0 ? (
            <PressableScale
              onPress={goBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel={t("onboarding.back")}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
            </PressableScale>
          ) : (
            <View style={styles.backButtonPlaceholder} />
          )}
          <Text style={styles.stepLabel}>
            {t("onboarding.stepOf", { current: stepIndex + 1, total: STEPS.length })}
          </Text>
        </View>
        <AnimatedProgressBar progress={(stepIndex + 1) / STEPS.length} style={styles.progress} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {step === "name" && (
          <NameStep
            value={draft.displayName}
            error={nameError}
            onChange={(value) => {
              // Cleared as soon as they start fixing it — leaving an error under a field the
              // student is actively correcting reads as the app not noticing.
              if (nameError) setNameError(null);
              updateDraft({ displayName: value });
            }}
          />
        )}

        {step === "language" && (
          <StepBody title={t("onboarding.language.title")} hint={t("onboarding.language.hint")}>
            {supportedUiLanguages().map((code) => (
              <OnboardingOption
                key={code}
                title={LANGUAGE_LABELS[code]}
                selected={draft.preferredLanguage === code}
                onPress={() => updateDraft({ preferredLanguage: code })}
              />
            ))}
            {/* Said out loud rather than quietly offering a shorter list than people expect. */}
            <Text style={styles.note}>{t("onboarding.language.note")}</Text>
          </StepBody>
        )}

        {step === "contentLanguages" && (
          <StepBody
            title={t("onboarding.contentLanguages.title")}
            hint={t("onboarding.contentLanguages.hint", { max: MAX_CONTENT_LANGUAGES })}
          >
            {contentLanguageOptions === null ? (
              <>
                <CardSkeleton height={56} />
                <CardSkeleton height={56} />
                <CardSkeleton height={56} />
              </>
            ) : contentLanguageOptions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="cloud-offline-outline" size={22} color={colors.text.muted} />
                <Text style={styles.emptyTitle}>{t("onboarding.contentLanguages.offlineTitle")}</Text>
                <Text style={styles.emptyHint}>{t("onboarding.contentLanguages.offlineHint")}</Text>
              </View>
            ) : (
              <>
                {contentLanguageOptions.map((language) => {
                  const selected = draft.contentLanguages.includes(language.code);
                  return (
                    <OnboardingOption
                      key={language.code}
                      multi
                      title={language.name}
                      selected={selected}
                      // Dimmed once the cap is reached, but still tappable — the tap is what
                      // produces the explanation below.
                      atLimit={!selected && draft.contentLanguages.length >= MAX_CONTENT_LANGUAGES}
                      onPress={() => {
                        const { next, refused } = toggleContentLanguage(draft.contentLanguages, language.code);
                        // Refused means the selection is unchanged: nothing is auto-deselected,
                        // so the student chooses which one to give up.
                        setLanguageLimitHit(refused);
                        if (!refused) updateDraft({ contentLanguages: next });
                      }}
                    />
                  );
                })}
                {languageLimitHit ? (
                  <View style={styles.errorRow} accessibilityLiveRegion="polite">
                    <Ionicons name="information-circle" size={15} color={colors.semantic.warning} />
                    <Text style={styles.limitText}>
                      {t("onboarding.contentLanguages.limit", { max: MAX_CONTENT_LANGUAGES })}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.note}>{t("onboarding.contentLanguages.note")}</Text>
              </>
            )}
          </StepBody>
        )}

        {step === "exam" && (
          <StepBody title={t("onboarding.exam.title")} hint={t("onboarding.exam.hint")}>
            {exams === null ? (
              <>
                <CardSkeleton height={56} />
                <CardSkeleton height={56} />
                <CardSkeleton height={56} />
              </>
            ) : exams.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="cloud-offline-outline" size={22} color={colors.text.muted} />
                <Text style={styles.emptyTitle}>{t("onboarding.exam.offlineTitle")}</Text>
                <Text style={styles.emptyHint}>{t("onboarding.exam.offlineHint")}</Text>
              </View>
            ) : (
              exams.map((exam) => (
                <OnboardingOption
                  key={exam.code}
                  title={exam.name}
                  meta={
                    exam.questionCount > 0
                      ? t("onboarding.exam.questionCount", { count: exam.questionCount })
                      : undefined
                  }
                  selected={draft.primaryExamCode === exam.code}
                  onPress={() =>
                    updateDraft({
                      primaryExamCode: exam.code,
                      // A stage belongs to an exam. Changing the exam invalidates it, and
                      // carrying it over would attach one exam's tier to another's profile.
                      examStageId: null,
                    })
                  }
                />
              ))
            )}
          </StepBody>
        )}

        {step === "plan" && (
          <StepBody title={t("onboarding.plan.title")} hint={t("onboarding.plan.hint")}>
            {showStageQuestion && (
              <>
                <Text style={styles.groupLabel}>{t("onboarding.plan.stageLabel")}</Text>
                {stageList.map((stage) => (
                  <OnboardingOption
                    key={stage.id}
                    title={stage.name}
                    selected={draft.examStageId === stage.id}
                    onPress={() => updateDraft({ examStageId: stage.id })}
                  />
                ))}
                <OnboardingOption
                  title={t("onboarding.plan.stageAny")}
                  selected={draft.examStageId === null}
                  onPress={() => updateDraft({ examStageId: null })}
                />
              </>
            )}

            <Text style={[styles.groupLabel, showStageQuestion && styles.groupLabelSpaced]}>
              {t("onboarding.plan.yearLabel")}
            </Text>
            {targetYearOptions(currentYear).map((year) => (
              <OnboardingOption
                key={year}
                title={String(year)}
                selected={draft.targetYear === year}
                onPress={() => updateDraft({ targetYear: year })}
              />
            ))}
            <OnboardingOption
              title={t("onboarding.plan.yearUnsure")}
              selected={draft.targetYear === null}
              onPress={() => updateDraft({ targetYear: null })}
            />
          </StepBody>
        )}

        {step === "level" && (
          <StepBody title={t("onboarding.level.title")} hint={t("onboarding.level.hint")}>
            {PREPARATION_LEVELS.map((level) => (
              <OnboardingOption
                key={level}
                // Keyed by the stored value, so rewording a label never rewrites a saved profile.
                title={t(`onboarding.level.${level}.title` as const)}
                description={t(`onboarding.level.${level}.description` as const)}
                selected={draft.preparationLevel === level}
                onPress={() => updateDraft({ preparationLevel: level })}
              />
            ))}
          </StepBody>
        )}

        {step === "time" && (
          <StepBody title={t("onboarding.time.title")} hint={t("onboarding.time.hint")}>
            {DAILY_STUDY_TIMES.map((band) => (
              <OnboardingOption
                key={band}
                title={t(`onboarding.time.${band}` as const)}
                selected={draft.dailyStudyTime === band}
                onPress={() => updateDraft({ dailyStudyTime: band })}
              />
            ))}
          </StepBody>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button size="lg" onPress={advance} disabled={!canContinue} loading={submitting}>
          {isLast ? t("onboarding.finish") : t("onboarding.continue")}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Which draft fields each step owns — used only to route a failed final validation back to the right step. */
const stepFieldMap: Record<StepId, string[]> = {
  name: ["displayName"],
  language: ["preferredLanguage"],
  contentLanguages: ["contentLanguages"],
  exam: ["primaryExamCode"],
  plan: ["examStageId", "targetYear"],
  level: ["preparationLevel"],
  time: ["dailyStudyTime"],
};

function StepBody({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const styles = useThemedStyles(buildStyles);
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.options}>{children}</View>
    </>
  );
}

function NameStep({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();

  return (
    <>
      <Text style={styles.title}>{t("onboarding.name.title")}</Text>
      <Text style={styles.hint}>{t("onboarding.name.hint")}</Text>

      <Text style={styles.fieldLabel}>{t("onboarding.name.label")}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t("onboarding.name.placeholder")}
        placeholderTextColor={colors.text.muted}
        style={[styles.input, error && styles.inputError]}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        // Above the validated maximum on purpose: hard-stopping mid-word feels like a broken
        // keyboard, whereas a message that says what the limit is can be acted on.
        maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
        accessibilityLabel={t("onboarding.name.label")}
      />
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={15} color={colors.semantic.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.base,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    backButton: {
      width: 44,
      height: 44,
      marginLeft: -spacing.md,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
    },
    // Keeps the step label in one place whether or not Back is shown, so it does not jump
    // sideways between step 1 and step 2.
    backButtonPlaceholder: {
      width: 44 - spacing.md,
      height: 44,
    },
    stepLabel: {
      ...typography.label,
    },
    progress: {
      marginTop: spacing.xs,
    },
    body: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing["2xl"],
    },
    title: {
      ...typography.pageTitle,
      marginBottom: spacing.sm,
    },
    hint: {
      ...typography.secondary,
      marginBottom: spacing.xl,
    },
    options: {
      gap: spacing.md,
    },
    groupLabel: {
      ...typography.label,
      marginBottom: spacing.xs,
    },
    groupLabelSpaced: {
      marginTop: spacing.lg,
    },
    note: {
      ...typography.caption,
      marginTop: spacing.sm,
    },
    fieldLabel: {
      ...typography.label,
      marginBottom: spacing.sm,
    },
    input: {
      ...typography.body,
      minHeight: 52,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      color: colors.text.primary,
    },
    inputError: {
      borderColor: colors.semantic.error,
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    errorText: {
      ...typography.secondary,
      flex: 1,
      color: colors.semantic.error,
    },
    limitText: {
      ...typography.secondary,
      flex: 1,
      color: colors.semantic.warning,
    },
    emptyBox: {
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.xl,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
    },
    emptyTitle: {
      ...typography.cardTitle,
      textAlign: "center",
    },
    emptyHint: {
      ...typography.secondary,
      textAlign: "center",
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
  });
