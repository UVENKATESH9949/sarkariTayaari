import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useSyncStatus } from "../sync/SyncContext";
import { LoadingMark } from "./LoadingMark";
import { QuoteRotator } from "./QuoteRotator";
import { spacing } from "./theme";
import { useTheme, useThemedStyles, type Theme } from "./ThemeContext";
import { useT } from "../i18n/I18nContext";

function ChecklistRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  return (
    <View style={styles.checklistRow}>
      <Ionicons
        name={done ? "checkmark-circle" : "ellipse-outline"}
        size={18}
        color={done ? colors.semantic.success : active ? colors.brand.light : colors.text.muted}
      />
      <Text style={[styles.checklistLabel, !active && !done && styles.checklistLabelMuted]}>{label}</Text>
    </View>
  );
}

/** Ceiling for the time-driven floor. Never 100: the bar must not claim to be finished
 * while the gate is still up, and the gate is up exactly as long as this is rendered. */
const TIME_FLOOR_CEILING = 95;
const TICK_MS = 200;

/**
 * Shown only for a device's genuinely first-ever sync (gated by
 * SyncContext.firstLaunchSyncActive, in mobile/src/app/_layout.tsx) — gone as soon as
 * reference data is written, or at the 5s ceiling, whichever comes first. The checklist
 * reflects the two real things runInitialSync does (reference data, then the question
 * pool) rather than fabricating a longer list.
 *
 * The bar is deliberately `max(real progress, time-based floor)`:
 *
 * - Real progress alone is unusable here. The question bank currently fits in a single
 *   page, so measured `synced / total` goes 0 → 100 in one step with nothing in between,
 *   which reads as a broken bar rather than a fast one.
 * - The floor climbs to 95% over the gate's own ceiling, so motion is continuous and
 *   monotonic, and stops short of implying completion.
 * - Whichever is further along wins, so a genuinely fast launch still shows fast
 *   progress rather than being held back to match a timer.
 *
 * What it must NOT do — and this is the line between smoothing and lying — is present a
 * synthetic question count next to a time-driven bar. Measured `synced / total` figures
 * belong on the More screen, where they are real. Here there is a percentage and a
 * checklist, and both are honest about being coarse.
 */
export function PreparingApp() {
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const { status, synced, total, firstLaunchStartedAt, firstLaunchMaxMs } = useSyncStatus();
  const [elapsed, setElapsed] = useState(0);

  const referenceDataDone = status !== "checking";
  const questionsDone = status === "completed" || status === "partial";

  useEffect(() => {
    if (firstLaunchStartedAt === null) return;
    const tick = () => setElapsed(Date.now() - firstLaunchStartedAt);
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [firstLaunchStartedAt]);

  const realPercent = total > 0 ? (synced / total) * 100 : 0;
  const timeFloor = Math.min(TIME_FLOOR_CEILING, (elapsed / firstLaunchMaxMs) * TIME_FLOOR_CEILING);
  const percent = Math.min(100, Math.max(realPercent, timeFloor));

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <LoadingMark label={t("common.preparing")} percent={percent} size="hero" />
      </View>

      <Text style={styles.title}>{t("prepare.heading")}</Text>
      <Text style={styles.subtitle}>
        We&rsquo;re getting your essential pages ready so your future navigation feels faster and smoother.
      </Text>

      <QuoteRotator style={styles.quote} />

      <View style={styles.checklist}>
        <ChecklistRow label={t("prepare.settingUpExams")} done={referenceDataDone} active={!referenceDataDone} />
        <ChecklistRow
          label={t("prepare.downloadingQuestions")}
          done={questionsDone}
          active={referenceDataDone && !questionsDone}
        />
      </View>

      <Text style={styles.footNote}>{t("prepare.subheading")}</Text>
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
      ...typography.body,
      color: colors.text.secondary,
      textAlign: "center",
      marginBottom: spacing.xl,
      paddingHorizontal: spacing.md,
    },
    quote: {
      marginBottom: spacing["2xl"],
      minHeight: 40,
    },
    checklist: {
      width: "100%",
      gap: spacing.sm + 2,
      marginBottom: spacing.lg,
    },
    checklistRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    checklistLabel: {
      ...typography.body,
      color: colors.text.primary,
    },
    checklistLabelMuted: {
      color: colors.text.muted,
    },
    footNote: {
      ...typography.caption,
      textAlign: "center",
    },
  });
