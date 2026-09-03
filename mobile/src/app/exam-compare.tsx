import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { Modal, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getExamGuideHybrid, type ExamGuide } from "../data/examGuideData";
import { useHybridMode } from "../data/hybridSource";
import { getSyncedExams, type ExamOption } from "../data/practiceData";
import { daysUntil, formatDate } from "../examGuide/dates";
import { EmptyState } from "../ui/EmptyState";
import { ContextualLoading } from "../ui/ContextualLoading";
import { CardSkeleton } from "../ui/Skeleton";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

/**
 * Exam Guide spec §27 "Exam Comparison". Capped at exactly two exams — a stated scope
 * decision, not a limitation slipped in quietly: a mobile-width side-by-side table stops
 * being readable past two columns, and a horizontal-scroll table for an 11-exam catalogue
 * is more complexity than this feature is worth yet.
 */
export default function ExamCompareScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const mode = useHybridMode();

  const [exams, setExams] = useState<ExamOption[]>([]);
  const [slotA, setSlotA] = useState<ExamOption | null>(null);
  const [slotB, setSlotB] = useState<ExamOption | null>(null);
  const [pickerOpenFor, setPickerOpenFor] = useState<"A" | "B" | null>(null);
  // Keyed to the exam pair it was loaded for (not bare guide values) so switching a slot
  // can't briefly show the previous pair's data while the new fetch is in flight — same
  // shape as PreparationPlanCard's `loaded` state, and avoids a synchronous setState in
  // the effect body below (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{ codeA: string; codeB: string; guideA: ExamGuide | null; guideB: ExamGuide | null } | null>(null);

  useEffect(() => {
    getSyncedExams(mode).then(setExams);
  }, [mode]);

  useEffect(() => {
    if (!slotA || !slotB) return;
    let cancelled = false;
    Promise.all([getExamGuideHybrid(slotA.code, mode), getExamGuideHybrid(slotB.code, mode)]).then(([a, b]) => {
      if (!cancelled) setLoaded({ codeA: slotA.code, codeB: slotB.code, guideA: a, guideB: b });
    });
    return () => {
      cancelled = true;
    };
  }, [slotA, slotB, mode]);

  const pairLoaded = !!(loaded && slotA && slotB && loaded.codeA === slotA.code && loaded.codeB === slotB.code);
  const guideA = pairLoaded ? loaded!.guideA : null;
  const guideB = pairLoaded ? loaded!.guideB : null;
  const loadingGuides = !!slotA && !!slotB && !pairLoaded;

  function selectExam(exam: ExamOption) {
    if (pickerOpenFor === "A") setSlotA(exam);
    else if (pickerOpenFor === "B") setSlotB(exam);
    setPickerOpenFor(null);
  }

  function feeGeneral(guide: ExamGuide | null): string {
    const fee = guide?.fees.find((f) => f.category === "GENERAL");
    if (!fee) return "—";
    return fee.exempted ? "Exempted" : `₹${fee.amountRupees}`;
  }

  function ageRange(guide: ExamGuide | null): string {
    if (!guide?.eligibility) return "—";
    const { minimumAge, maximumAge } = guide.eligibility;
    if (minimumAge === null && maximumAge === null) return "—";
    return `${minimumAge ?? "—"}–${maximumAge ?? "—"} yrs`;
  }

  function closesIn(guide: ExamGuide | null): string {
    const days = guide ? daysUntil(guide.applicationEnd) : null;
    if (days === null) return guide?.applicationEnd ? formatDate(guide.applicationEnd) ?? "—" : "—";
    if (days < 0) return "Closed";
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  const rows: { label: string; a: (g: ExamGuide | null) => string }[] = [
    { label: "Status", a: (g) => (g ? g.status.replaceAll("_", " ").toLowerCase() : "—") },
    { label: "Application closes in", a: closesIn },
    { label: "Vacancies", a: (g) => (g?.vacancyCount !== null && g?.vacancyCount !== undefined ? String(g.vacancyCount) : "—") },
    { label: "Fee (General)", a: feeGeneral },
    { label: "Age range", a: ageRange },
    { label: "Notification date", a: (g) => (g?.notificationDate ? formatDate(g.notificationDate) ?? "—" : "—") },
  ];

  return (
    <>
      <Stack.Screen options={{ title: "Compare Exams" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.intro}>Pick two exams to compare their key facts side by side.</Text>

        <View style={styles.slotRow}>
          <Pressable style={styles.slotButton} onPress={() => setPickerOpenFor("A")} accessibilityRole="button" accessibilityLabel="Choose first exam">
            <Text style={styles.slotButtonText} numberOfLines={2}>{slotA?.name ?? "Choose exam"}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
          </Pressable>
          <Text style={styles.vsText}>vs</Text>
          <Pressable style={styles.slotButton} onPress={() => setPickerOpenFor("B")} accessibilityRole="button" accessibilityLabel="Choose second exam">
            <Text style={styles.slotButtonText} numberOfLines={2}>{slotB?.name ?? "Choose exam"}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.text.muted} />
          </Pressable>
        </View>

        {!slotA || !slotB ? (
          <EmptyState icon="git-compare-outline" title="Choose two exams" body="Select an exam in both slots above to see the comparison." />
        ) : loadingGuides ? (
          <ContextualLoading message="Loading..." skeleton={<CardSkeleton height={200} />} />
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <View style={styles.tableLabelCell} />
              <Text style={[styles.tableHeaderCell, styles.tableValueCell]} numberOfLines={2}>{slotA.name}</Text>
              <Text style={[styles.tableHeaderCell, styles.tableValueCell]} numberOfLines={2}>{slotB.name}</Text>
            </View>
            {rows.map((row, i) => (
              <View key={row.label} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tableLabelCell, styles.tableLabelText]}>{row.label}</Text>
                <Text style={[styles.tableValueCell, styles.tableValueText]}>{row.a(guideA)}</Text>
                <Text style={[styles.tableValueCell, styles.tableValueText]}>{row.a(guideB)}</Text>
              </View>
            ))}
            {(!guideA || !guideB) && (
              <Text style={styles.noGuideNote}>
                {!guideA && !guideB ? "Neither exam" : !guideA ? slotA.name : slotB.name} {!guideA && !guideB ? "has" : "doesn't"} have a current
                recruitment cycle configured yet — those rows show &quot;—&quot;.
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={pickerOpenFor !== null} transparent animationType="fade" onRequestClose={() => setPickerOpenFor(null)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setPickerOpenFor(null)}
          accessibilityRole="button"
          accessibilityLabel="Close exam picker"
        >
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Choose an exam</Text>
            <ScrollView style={styles.pickerList}>
              {exams.map((exam) => (
                <Pressable
                  key={exam.code}
                  style={styles.pickerRow}
                  onPress={() => selectExam(exam)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${exam.name}`}
                >
                  <Text style={styles.pickerRowText}>{exam.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { padding: spacing.xl, paddingBottom: spacing["3xl"] },
    intro: { fontSize: 14, color: colors.text.secondary, marginBottom: spacing.base, lineHeight: 20 },
    slotRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
    slotButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.xs,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    slotButtonText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text.primary },
    vsText: { fontSize: 12, color: colors.text.muted, fontWeight: "700" },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    tableHeaderRow: {
      flexDirection: "row",
      backgroundColor: colors.surfaceElevated2,
      padding: spacing.sm + 2,
    },
    tableHeaderCell: { fontSize: 12, fontWeight: "700", color: colors.text.primary },
    tableRow: {
      flexDirection: "row",
      padding: spacing.sm + 2,
      backgroundColor: colors.surfaceElevated,
    },
    tableRowAlt: { backgroundColor: colors.surfaceElevated2 },
    tableLabelCell: { flex: 1.1 },
    tableLabelText: { fontSize: 12, color: colors.text.muted, fontWeight: "600" },
    tableValueCell: { flex: 1, paddingLeft: spacing.sm },
    tableValueText: { fontSize: 12.5, color: colors.text.primary },
    noGuideNote: {
      fontSize: 11,
      color: colors.text.muted,
      fontStyle: "italic",
      padding: spacing.sm + 2,
      lineHeight: 16,
    },
    backdrop: { flex: 1, backgroundColor: "rgba(2, 3, 5, 0.7)", justifyContent: "center", padding: spacing.xl },
    pickerCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: spacing.lg,
      maxHeight: "70%",
    },
    pickerTitle: { fontSize: 17, fontWeight: "700", color: colors.text.primary, marginBottom: spacing.md },
    pickerList: { maxHeight: 360 },
    pickerRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
    pickerRowText: { fontSize: 15, color: colors.text.primary },
  });
