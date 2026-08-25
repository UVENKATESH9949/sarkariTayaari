import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useSyncStatus } from "../sync/SyncContext";
import { LoadingMark } from "./LoadingMark";
import { QuoteRotator } from "./QuoteRotator";
import { colors, spacing, typography } from "./theme";

function ChecklistRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
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

/**
 * Shown only for a device's genuinely first-ever sync (gated by
 * SyncContext.firstLaunchSyncActive, in mobile/src/app/_layout.tsx) — gone the instant
 * that sync reaches "completed" or "partial". The checklist below reflects the two real
 * things runInitialSync actually does (reference data, then the question pool) rather
 * than fabricating a longer list; the progress bar is driven by genuine synced/total
 * counts, never a timer.
 */
export function PreparingApp() {
  const { status, synced, total } = useSyncStatus();

  const referenceDataDone = status !== "checking";
  const questionsDone = status === "completed" || status === "partial";
  const percent = referenceDataDone && total > 0 ? (synced / total) * 100 : 0;

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <LoadingMark label="PREPARING" percent={percent} size="hero" />
      </View>

      <Text style={styles.title}>We&rsquo;re preparing your SarkariTaayari experience.</Text>
      <Text style={styles.subtitle}>
        We&rsquo;re getting your essential pages ready so your future navigation feels faster and smoother.
      </Text>

      <QuoteRotator style={styles.quote} />

      <View style={styles.checklist}>
        <ChecklistRow label="Setting up exam data" done={referenceDataDone} active={!referenceDataDone} />
        <ChecklistRow
          label="Downloading practice questions"
          done={questionsDone}
          active={referenceDataDone && !questionsDone}
        />
      </View>

      <Text style={styles.footNote}>This may take a moment depending on your network — please stay with us.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
