import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getFollowedExams } from "../db/followedExams";
import { getSyncedExams } from "../data/practiceData";
import { getExamGuideHybrid } from "../data/examGuideData";
import { useHybridMode } from "../data/hybridSource";
import { formatDate } from "../examGuide/dates";
import type { ImportantDateSummary } from "../api/examGuide";
import { Card } from "../ui/Card";
import { ContextualLoading } from "../ui/ContextualLoading";
import { EmptyState } from "../ui/EmptyState";
import { ListSkeleton } from "../ui/Skeleton";
import { spacing, radius } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

type CalendarEntry = {
  examCode: string;
  examName: string;
  date: ImportantDateSummary;
  sortDate: Date;
};

type Scope = "FOLLOWED" | "ALL";

/**
 * Exams module Phase 5 — every followed (or all) exam's Important Dates merged into one
 * chronological, month-grouped list. Reuses `getExamGuideHybrid` (Phase B's offline
 * cache) per exam code rather than building a new bulk endpoint or local query: at this
 * app's exam-catalogue scale (~11), one Promise.all of already-existing per-exam reads
 * is simpler than a new cross-exam SQL query, and it's exactly the same cost the local
 * cache already pays when My Exams computes its own recommendation heuristic.
 */
export default function ExamCalendarScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const mode = useHybridMode();

  const [scope, setScope] = useState<Scope>("FOLLOWED");
  // Keyed to (scope, mode) rather than a bare value — same pattern PreparationPlanCard
  // established: deriving "still loading for the current inputs" by key comparison
  // avoids a synchronous setState at the top of the effect body
  // (react-hooks/set-state-in-effect) that resetting to a loading state would otherwise need.
  const [loaded, setLoaded] = useState<{ key: string; items?: CalendarEntry[]; error?: string } | null>(null);
  const key = `${scope}:${mode}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const codes =
        scope === "FOLLOWED"
          ? (await getFollowedExams()).map((e) => e.code)
          : (await getSyncedExams(mode)).map((e) => e.code);

      const guides = await Promise.all(codes.map((code) => getExamGuideHybrid(code, mode).catch(() => null)));
      if (cancelled) return;

      const merged: CalendarEntry[] = [];
      guides.forEach((guide) => {
        if (!guide) return;
        guide.importantDates.forEach((date) => {
          const raw = date.startDate ?? date.endDate;
          if (!raw) return;
          merged.push({ examCode: guide.examCode, examName: guide.examName, date, sortDate: new Date(raw) });
        });
      });
      merged.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
      setLoaded({ key, items: merged });
    })().catch((err) => {
      if (!cancelled) setLoaded({ key, error: err.message ?? String(err) });
    });

    return () => {
      cancelled = true;
    };
  }, [key, scope, mode]);

  const current = loaded?.key === key ? loaded : null;
  const entries = current?.items ?? null;
  const error = current?.error ?? null;

  const groups = useMemo(() => {
    if (!entries) return [];
    const byMonth = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const key = entry.sortDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const list = byMonth.get(key) ?? [];
      list.push(entry);
      byMonth.set(key, list);
    }
    return Array.from(byMonth.entries());
  }, [entries]);

  function openGuide(entry: CalendarEntry) {
    trackEvent("exam_calendar_opened", { examCode: entry.examCode });
    router.push({ pathname: "/exam-guide", params: { examCode: entry.examCode, examName: entry.examName } });
  }

  return (
    <>
      <Stack.Screen options={{ title: "Exam Calendar" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleChip, scope === "FOLLOWED" && styles.toggleChipActive]}
            onPress={() => setScope("FOLLOWED")}
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, scope === "FOLLOWED" && styles.toggleTextActive]}>My Exams</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleChip, scope === "ALL" && styles.toggleChipActive]}
            onPress={() => setScope("ALL")}
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, scope === "ALL" && styles.toggleTextActive]}>All Exams</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {entries === null ? (
          <ContextualLoading message="Loading dates..." skeleton={<ListSkeleton />} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No upcoming dates"
            body={
              scope === "FOLLOWED"
                ? "Follow an exam with a current recruitment cycle to see its dates here."
                : "No active exam currently has a published recruitment cycle with dates."
            }
          />
        ) : (
          groups.map(([month, monthEntries]) => (
            <View key={month} style={styles.monthGroup}>
              <Text style={styles.monthHeader}>{month}</Text>
              <Card variant="container">
                {monthEntries.map((entry, i) => (
                  <Pressable
                    key={entry.date.id}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                    onPress={() => openGuide(entry)}
                    accessibilityRole="button"
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{entry.date.title}</Text>
                      <Text style={styles.rowMeta}>
                        {entry.examName} · {formatDate(entry.date.startDate ?? entry.date.endDate)}
                      </Text>
                    </View>
                    {entry.date.official ? (
                      <Ionicons name="checkmark-circle" size={16} color={colors.semantic.success} />
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
                  </Pressable>
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    toggleRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    toggleChip: {
      flex: 1,
      alignItems: "center",
      backgroundColor: colors.surfaceElevated2,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm + 2,
    },
    toggleChipActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    toggleText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    toggleTextActive: {
      color: colors.text.onAccent,
    },
    monthGroup: {
      marginBottom: spacing.lg,
    },
    monthHeader: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.brand.light,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.md,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    rowMeta: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    errorText: {
      fontSize: 13,
      color: colors.semantic.error,
      marginBottom: spacing.base,
    },
  });
