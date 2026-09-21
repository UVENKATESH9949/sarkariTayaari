import { useCallback, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  DAILY_STUDY_TIMES,
  PREPARATION_LEVELS,
  type DailyStudyTime,
  type PreparationLevel,
} from "@sarkaritaiyaari/core/onboarding";
import {
  loadPlanningPreferences,
  savePlanningPreferences,
  type PlanningPreferences,
} from "../data/preparationProfileData";
import { useT } from "../i18n/I18nContext";
import { OnboardingOption } from "../onboarding/OnboardingOption";
import { ContextualLoading } from "../ui/ContextualLoading";
import { SectionLabel } from "../ui/SectionLabel";
import { ListSkeleton } from "../ui/Skeleton";
import { spacing } from "../ui/theme";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

/**
 * "Study preferences" — changing the two onboarding answers the daily planner reads.
 *
 * <h2>Why this screen exists</h2>
 * Onboarding asked these once and nothing could change them afterwards. That was invisible until
 * `daily-plan.tsx` shipped and began telling students *"we don't know how long you study, so
 * we've assumed an hour"* — naming an assumption the student had no way to correct. This is the
 * correction, and it is the smaller half of the problem the daily plan exposed.
 *
 * **Deliberately two fields, not the whole profile.** The study-time band is what the budget is
 * computed from and the preparation level is its sibling from the same onboarding step; the
 * active exam already has its own switcher and a display name is not a planning input. A screen
 * that re-offered all of onboarding would be a second onboarding to keep in step with the first.
 *
 * **Saves on tap, with no Save button.** Each option is a single choice among five, so a commit
 * step would add a way to lose an edit without adding a way to express one. The write is local
 * first — this profile is device-local and merely *syncs* — so it works offline exactly as
 * onboarding does.
 *
 * Translated, unlike `daily-plan.tsx`: every label here already exists in the catalogues because
 * onboarding asks the same two questions, so reusing `onboarding.time.*` and `onboarding.level.*`
 * costs nothing and avoids stranding this screen in English.
 */
export default function StudyPreferencesScreen() {
  const styles = useThemedStyles(buildStyles);
  const t = useT();

  // Keyed loaded-state rather than a value plus a flag, the pattern this codebase uses
  // throughout to keep a synchronous setState out of an effect body.
  const [loaded, setLoaded] = useState<PlanningPreferences | null>(null);

  useEffect(() => {
    trackEvent("study_preferences_opened");
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPlanningPreferences()
      .then((prefs) => {
        if (!cancelled) setLoaded(prefs);
      })
      .catch(() => {
        // The profile row is created during onboarding and read with defaults, so a failure here
        // means local storage itself is unavailable — showing empty selections is the honest
        // result, and tapping one will surface any real write failure.
        if (!cancelled) setLoaded({ dailyStudyTime: null, preparationLevel: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Optimistic, and safe to be: the local write is the source of truth this screen reads back
   * from, and `savePlanningPreferences` never throws. Waiting for the server round trip before
   * moving the tick would make a preference feel like a network operation.
   */
  const choose = useCallback(
    (patch: Partial<PlanningPreferences>) => {
      setLoaded((current) => (current ? { ...current, ...patch } : current));
      trackEvent("study_preferences_changed", {
        field: Object.keys(patch)[0],
        value: String(Object.values(patch)[0]),
      });
      void savePlanningPreferences(patch);
    },
    [],
  );

  return (
    <>
      <Stack.Screen options={{ title: t("studyPreferences.title") }} />
      <ScrollView contentContainerStyle={styles.container}>
        {loaded === null ? (
          <ContextualLoading message={t("studyPreferences.loading")} skeleton={<ListSkeleton count={5} />} />
        ) : (
          <>
            <Text style={styles.intro}>{t("studyPreferences.intro")}</Text>

            <SectionLabel label={t("onboarding.time.title")} />
            <Text style={styles.hint}>{t("onboarding.time.hint")}</Text>
            {DAILY_STUDY_TIMES.map((band: DailyStudyTime) => (
              <OnboardingOption
                key={band}
                title={t(`onboarding.time.${band}` as const)}
                selected={loaded.dailyStudyTime === band}
                onPress={() => choose({ dailyStudyTime: band })}
              />
            ))}

            {/*
             * Stated rather than left to be discovered. A day is planned once and stored, so a
             * change made now cannot reshape a plan the student may already have started — and a
             * setting that appears to do nothing is worse than one that says when it applies.
             */}
            <Text style={styles.note}>{t("studyPreferences.appliesTomorrow")}</Text>

            <SectionLabel label={t("onboarding.level.title")} style={styles.sectionSpacing} />
            <Text style={styles.hint}>{t("onboarding.level.hint")}</Text>
            {PREPARATION_LEVELS.map((level: PreparationLevel) => (
              <OnboardingOption
                key={level}
                title={t(`onboarding.level.${level}.title` as const)}
                description={t(`onboarding.level.${level}.description` as const)}
                selected={loaded.preparationLevel === level}
                onPress={() => choose({ preparationLevel: level })}
              />
            ))}

            <View style={styles.footerSpacer} />
          </>
        )}
      </ScrollView>
    </>
  );
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    intro: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.text.secondary,
      marginBottom: spacing.lg,
    },
    hint: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
      marginBottom: spacing.sm,
    },
    note: {
      fontSize: 11.5,
      color: colors.text.muted,
      fontStyle: "italic",
      marginTop: spacing.sm,
    },
    sectionSpacing: {
      marginTop: spacing.xl,
    },
    footerSpacer: {
      height: spacing.lg,
    },
  });
}
