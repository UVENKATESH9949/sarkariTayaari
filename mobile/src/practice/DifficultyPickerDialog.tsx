import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  getDifficultyCounts,
  getDifficultyLevels,
  PRACTICE_QUESTION_LIMIT,
  type DifficultyCounts,
  type DifficultyLevel,
} from "../data/practiceData";
import { useHybridMode } from "../data/hybridSource";
import { useSyncStatus } from "../sync/SyncContext";
import type { IoniconName } from "../constants/subjects";
import { ListSkeleton } from "../ui/Skeleton";
import { DURATION } from "../ui/motion";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

/** The topic the dialog is open for. `null` closes it. */
export type DifficultyPickerTarget = { id: string; name: string } | null;

/**
 * Module-level rather than inline literals: these feed `useMemo` dependency lists below,
 * and a fresh `[]`/`{}` on every render would make those memos recompute every time.
 */
const EMPTY_LEVELS: DifficultyLevel[] = [];
const EMPTY_COUNTS: DifficultyCounts = {};

/**
 * The widest the card is allowed to get, in dp.
 *
 * It is a centred dialog, not a full-bleed surface, so on a large phone or a tablet it stops
 * growing rather than stretching a four-row list across the whole screen. Below this width
 * the horizontal padding on the backdrop is what shapes it.
 */
const CARD_MAX_WIDTH = 380;

/**
 * A ceiling on the card's height, as a fraction of the window, so a pathological number of
 * synced difficulty levels can never grow it past the screen. With the three or four levels
 * this product actually has it never binds.
 *
 * Applied against a real dp height from `useWindowDimensions()` rather than as a
 * `maxHeight: "80%"` string. That distinction is not cosmetic: a percentage resolves against
 * the parent's height, and the parent here is a `flex: 1` backdrop inside a `Modal`, which
 * Yoga does not reliably treat as definite.
 *
 * A RELATED TRAP, worth keeping written down because it cost three attempts to find when this
 * was still a bottom sheet: the rows must live in a plain `View`, never a `ScrollView`. A
 * ScrollView reports no intrinsic height, so a container that sizes to its content can never
 * size to it — the card came out as header-plus-whatever-the-ScrollView-was-handed, and the
 * last row was clipped. Re-introduce a ScrollView here without giving it a definite height and
 * the clipping comes straight back.
 */
const CARD_MAX_HEIGHT_FRACTION = 0.8;

type Props = {
  target: DifficultyPickerTarget;
  examCode: string | null;
  onClose: () => void;
  onSelect: (levelKey: string, levelLabel: string) => void;
};

type Row = {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
  bg: string;
  count: number;
};

/**
 * The difficulty step, as a centred dialog rather than a screen.
 *
 * This is the point of the navigation change: choosing a level is a single decision about the
 * topic already on screen, so pushing a route for it cost a transition, a header, a back
 * press, and the loss of the topic list underneath. Everything below is the logic
 * `practice/levels.tsx` already ran - the same two reads, the same admin-defined level set,
 * the same zero-count gate - without the route.
 *
 * WHY A CENTRED CARD AND NOT A BOTTOM SHEET. It was a sheet first, and a sheet has to fight
 * for the bottom of the screen against the tab bar and the gesture bar, which is exactly where
 * it kept losing rows. A card centred in the free space has no edge to be crowded by, sizes to
 * its own content, and reads as a fixed prompt rather than a surface you might try to drag.
 * `animationType="fade"` plus a `FadeIn` and no translation is deliberate for the same reason:
 * anything that slides invites a drag gesture that does not exist.
 *
 * The levels screen still exists and is NOT replaced: Today's Plan, the Exam Guide, the
 * weakness radar, the study roadmap and Syllabus & Trends all deep-link straight to it with a
 * topic they picked themselves, and none of those flows passes through this dialog.
 *
 * Levels are whatever the admin has synced, in their order - never a hardcoded
 * Easy/Medium/Hard. A fourth level would appear here with no app release, and an exam whose
 * bank is missing one simply shows fewer rows.
 */
export function DifficultyPickerDialog({ target, examCode, onClose, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const { height: windowHeight } = useWindowDimensions();
  const t = useT();
  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  const topicId = target?.id ?? null;

  /*
   * Levels and counts, held with the topic they were loaded for.
   *
   * The obvious shape - clear the counts and raise a `loading` flag at the top of the
   * effect - is the `react-hooks/set-state-in-effect` pattern this codebase has fixed
   * before, so this uses the same keyed-loaded-state form as `ui/PreparationPlanCard.tsx`
   * instead. It also closes a real defect rather than only a lint rule: a mismatched key
   * renders as loading, so one topic's availability can never appear under another topic's
   * name while the new numbers are in flight. That is the one thing in this dialog a student
   * could act on wrongly.
   */
  const [data, setData] = useState<{ key: string; levels: DifficultyLevel[]; counts: DifficultyCounts } | null>(
    null,
  );

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    Promise.all([getDifficultyLevels(mode), getDifficultyCounts(topicId, examCode, mode)])
      .then(([levelRows, countRows]) => {
        if (!cancelled) setData({ key: topicId, levels: levelRows, counts: countRows });
      })
      .catch(() => {
        if (!cancelled) setData({ key: topicId, levels: [], counts: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, examCode, mode, syncVersion]);

  /*
   * Whether the "you get a fresh set every time" half of the banner is TRUE.
   *
   * It is, but only on the local path: `getPracticeQuestions` draws with `ORDER BY RANDOM()`
   * from SQLite. The live path — before the first sync finishes — pages the backend
   * deterministically and only shuffles the page it received, so consecutive sessions would be
   * the same twenty questions in a different order. Rather than print a promise the app cannot
   * keep in that state, the clause is dropped and the banner states only the session length,
   * which is true either way.
   */
  const freshEverySession = mode === "local";

  const loading = data === null || data.key !== topicId;
  const levels = loading ? EMPTY_LEVELS : data.levels;
  const counts = loading ? EMPTY_COUNTS : data.counts;

  const rows = useMemo<Row[]>(
    () =>
      levels.map((level) => ({
        key: level.code,
        label: level.label,
        // A level the admin has not styled falls back to the live theme rather than to a
        // baked colour, which would be the one illegible row in the opposite theme.
        icon: (level.icon as IoniconName) || "ellipse-outline",
        color: level.color || colors.text.secondary,
        bg: level.colorBg || colors.surfaceElevated2,
        count: counts[level.code] ?? 0,
      })),
    [levels, counts, colors],
  );

  // Summed from the real counts, so "All Levels" can never disagree with the rows above it.
  const allTotal = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const choose = (key: string, label: string) => {
    onClose();
    onSelect(key, label);
  };

  return (
    <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={styles.backdrop} entering={FadeIn.duration(DURATION.quick)}>
        {/* Full-bleed and behind the card, so a tap anywhere outside dismisses. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("practice.closeLevelPicker")}
        />
        <Animated.View
          style={[styles.card, { maxHeight: windowHeight * CARD_MAX_HEIGHT_FRACTION }]}
          entering={FadeIn.duration(DURATION.quick)}
        >
          <Text style={styles.topicName} numberOfLines={2}>
            {target?.name}
          </Text>
          <Text style={styles.prompt}>{t("practice.chooseDifficulty")}</Text>

          {/*
            Replaces the per-level question counts that used to sit under each row. Those
            counts answered a question nobody was asking at this moment — a student picking
            "Medium" does not care that the topic holds 42 of them, only how long this is
            going to take and whether it will be the same questions as last time.
          */}
          <View style={styles.sessionNote}>
            <Ionicons name="albums-outline" size={16} color={colors.brand.primary} />
            <Text style={styles.sessionNoteText}>
              {t("practice.sessionSize", { count: String(PRACTICE_QUESTION_LIMIT) })}
              {freshEverySession ? ` \u00b7 ${t("practice.freshEverySession")}` : ""}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ListSkeleton count={3} />
            </View>
          ) : (
            <View style={styles.list}>
              {rows.map((row) => {
                const disabled = row.count === 0;
                return (
                  <Pressable
                    key={row.key}
                    disabled={disabled}
                    onPress={() => choose(row.key, row.label)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    style={({ pressed }) => [
                      styles.levelRow,
                      pressed && styles.levelRowPressed,
                      disabled && styles.levelRowDisabled,
                    ]}
                  >
                    <View style={[styles.levelIcon, { backgroundColor: row.bg }]}>
                      <Ionicons name={row.icon} size={18} color={row.color} />
                    </View>
                    <View style={styles.levelText}>
                      <Text style={styles.levelLabel}>{row.label}</Text>
                      {/* Only the empty case still says anything. A level that HAS questions
                          needs no number here — the banner above already states the session
                          length, which is the figure that actually applies. */}
                      {disabled && <Text style={styles.levelMeta}>{t("practice.noQuestionsYet")}</Text>}
                    </View>
                    {!disabled && <Ionicons name="chevron-forward" size={17} color={colors.text.muted} />}
                  </Pressable>
                );
              })}

              {/* Kept from the levels screen: a mixed set is how most students actually
                  practise, and it is the only option that still works when the bank is thin
                  at every individual level. */}
              <Pressable
                disabled={allTotal === 0}
                onPress={() => choose("all", t("practice.allLevels"))}
                accessibilityRole="button"
                accessibilityState={{ disabled: allTotal === 0 }}
                style={({ pressed }) => [
                  styles.levelRow,
                  styles.allRow,
                  pressed && styles.levelRowPressed,
                  allTotal === 0 && styles.levelRowDisabled,
                ]}
              >
                <View style={[styles.levelIcon, { backgroundColor: colors.brand.glowSoft }]}>
                  <Ionicons name="layers-outline" size={18} color={colors.brand.primary} />
                </View>
                <View style={styles.levelText}>
                  <Text style={styles.levelLabel}>{t("practice.allLevels")}</Text>
                  <Text style={styles.levelMeta}>
                    {allTotal === 0 ? t("practice.noQuestionsYet") : t("practice.mixedDifficulty")}
                  </Text>
                </View>
                {allTotal > 0 && <Ionicons name="chevron-forward" size={17} color={colors.text.muted} />}
              </Pressable>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const buildStyles = ({ colors, shadow, mode }: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      // Centred in the free space rather than pinned to an edge. `alignItems` plus the card's
      // own `maxWidth` is what keeps it a dialog instead of a full-width panel.
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.xl,
      /*
       * Theme-dependent, and it has to be. In light mode a soft wash is enough: the card is
       * white and the page behind it is a pale blue-grey, so they separate on their own, and a
       * heavier scrim would needlessly hide the topic list the student is choosing from.
       *
       * Dark mode has no such luxury — found on a device. The page is already near-black, so
       * the same 0.38 wash changes almost nothing and the card floated with barely a visible
       * edge. A floating surface needs the ground pushed further down before the surface
       * itself can lift off it.
       */
      backgroundColor: mode === "dark" ? "rgba(2, 4, 8, 0.66)" : "rgba(13, 21, 36, 0.38)",
    },
    card: {
      width: "100%",
      maxWidth: CARD_MAX_WIDTH,
      // The `elevated` Card variant's own tokens, not `surface`/`borderSubtle`. That pairing
      // is for a card sitting ON the page; this one floats above a dimmed one, and in dark
      // mode the palette lifts a surface by making it brighter than its ground (see the note
      // in packages/core/src/design/palettes.ts). White in light mode either way.
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      ...shadow.card,
    },
    topicName: {
      fontWeight: "700",
      fontSize: 19,
      lineHeight: 25,
      color: colors.text.primary,
    },
    prompt: {
      fontWeight: "400",
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.secondary,
      marginTop: 2,
      marginBottom: spacing.base,
    },
    sessionNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.brand.glowSoft,
      borderWidth: 1,
      borderColor: colors.borderAccent,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 1,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.base,
    },
    sessionNoteText: {
      flex: 1,
      fontWeight: "500",
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.brand.light,
    },
    loadingWrap: {
      paddingBottom: spacing.xs,
    },
    list: {
      gap: spacing.sm + 2,
    },
    levelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
    },
    levelRowPressed: {
      backgroundColor: colors.surfaceElevated2,
    },
    levelRowDisabled: {
      opacity: 0.45,
    },
    allRow: {
      // One step recessed from the real levels: it is a fallback, not a fourth difficulty,
      // and giving it equal weight buries the choice the dialog exists to ask.
      backgroundColor: colors.surfaceElevated2,
    },
    levelIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    levelText: {
      flex: 1,
    },
    levelLabel: {
      fontWeight: "600",
      fontSize: 15.5,
      lineHeight: 21,
      color: colors.text.primary,
    },
    levelMeta: {
      fontWeight: "400",
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.text.muted,
      marginTop: 1,
    },
  });
