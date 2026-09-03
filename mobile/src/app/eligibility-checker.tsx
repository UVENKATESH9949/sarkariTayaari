import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { Platform, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import type { ExamGuide } from "../api/examGuide";
import { getExamGuideHybrid } from "../data/examGuideData";
import { useHybridMode } from "../data/hybridSource";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { ContextualLoading } from "../ui/ContextualLoading";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

const CATEGORIES = ["GENERAL", "OBC", "SC", "ST", "PWBD", "EX_SERVICEMEN"] as const;
type Category = (typeof CATEGORIES)[number];

function labelFor(category: string): string {
  return category.replaceAll("_", " ");
}

/** Whole years between two dates — a plain subtraction gets the birthday-not-yet-reached case wrong. */
function ageInYears(dob: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dob.getMonth() || (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

type Verdict = {
  ageOk: boolean | null;
  ageDetail: string;
  qualificationOk: boolean | null;
  effectiveMaxAge: number | null;
};

/**
 * Exam Guide spec §9 — computed entirely from the same `eligibility_rules` data the
 * Guide screen already renders (fetched again here rather than passed through route
 * params, since a plain object beats serializing category-relaxation maps through a
 * URL). Age is the one criterion this can actually compute; qualification is free text
 * on the backend, so it's a self-declared checkbox, not a verified fact — see the
 * disclaimer, which the spec requires verbatim in spirit ("never an absolute legal
 * determination").
 */
export default function EligibilityCheckerScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const { examCode, examName } = useLocalSearchParams<{ examCode: string; examName?: string }>();
  const mode = useHybridMode();

  const [guide, setGuide] = useState<ExamGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dob, setDob] = useState<Date | null>(null);
  const [dobText, setDobText] = useState("");
  const [category, setCategory] = useState<Category>("GENERAL");
  const [qualificationConfirmed, setQualificationConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!examCode) return;
    getExamGuideHybrid(examCode, mode)
      .then(setGuide)
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [examCode, mode]);

  // "DD/MM/YYYY" rather than a native date-picker dependency — no such component is
  // installed in this app yet, and adding one is out of scope for a Phase-1 checker.
  function parseDob(text: string): Date | null {
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, d, m, y] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null; // rejects e.g. 31/02
    return date;
  }

  function handleDobChange(text: string) {
    setDobText(text);
    setDob(parseDob(text));
  }

  const verdict: Verdict | null = useMemo(() => {
    const eligibility = guide?.eligibility;
    if (!eligibility || !dob) return null;

    const asOf = eligibility.ageCutoffDate ? new Date(eligibility.ageCutoffDate) : new Date();
    const age = ageInYears(dob, asOf);
    const relaxation = eligibility.categoryRelaxation?.[category] ?? 0;
    const effectiveMaxAge = eligibility.maximumAge !== null ? eligibility.maximumAge + relaxation : null;

    let ageOk: boolean | null = null;
    let ageDetail = `You are ${age} as of ${asOf.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.`;
    if (eligibility.minimumAge !== null && age < eligibility.minimumAge) {
      ageOk = false;
      ageDetail += ` Below the minimum age of ${eligibility.minimumAge}.`;
    } else if (effectiveMaxAge !== null && age > effectiveMaxAge) {
      ageOk = false;
      ageDetail += ` Above the maximum age of ${effectiveMaxAge}${relaxation > 0 ? ` (${eligibility.maximumAge} + ${relaxation} ${labelFor(category)} relaxation)` : ""}.`;
    } else if (eligibility.minimumAge !== null || eligibility.maximumAge !== null) {
      ageOk = true;
    }

    return { ageOk, ageDetail, qualificationOk: guide?.eligibility ? qualificationConfirmed : null, effectiveMaxAge };
  }, [guide, dob, category, qualificationConfirmed]);

  const overallEligible = verdict ? verdict.ageOk !== false && (!guide?.eligibility?.qualification || qualificationConfirmed) : null;

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ContextualLoading message="Loading eligibility rules..." skeleton={<CardSkeleton height={160} />} />
      </View>
    );
  }

  if (error || !guide?.eligibility) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Eligibility checker not available"
          body={error ?? `${examName ?? examCode} doesn't have eligibility rules configured yet.`}
        />
      </View>
    );
  }

  const eligibility = guide.eligibility;

  return (
    <>
      <Stack.Screen options={{ title: "Check My Eligibility" }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Answer a couple of questions to see whether you appear eligible for {guide.examName}.
        </Text>

        <Card variant="container" style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Date of birth</Text>
            <View style={styles.dobInputRow}>
              {/* A plain text input rather than a native picker component — see the note above. */}
              <DobInput value={dobText} onChangeText={handleDobChange} />
            </View>
            {dobText.length > 0 && !dob && <Text style={styles.fieldError}>Enter as DD/MM/YYYY.</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                  onPress={() => setCategory(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: category === c }}
                  accessibilityLabel={labelFor(c)}
                >
                  <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
                    {labelFor(c)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {eligibility.qualification && (
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setQualificationConfirmed((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: qualificationConfirmed }}
              accessibilityLabel={`I have, or will have by the deadline: ${eligibility.qualification}`}
            >
              <Ionicons
                name={qualificationConfirmed ? "checkbox" : "square-outline"}
                size={20}
                color={qualificationConfirmed ? colors.brand.light : colors.text.muted}
              />
              <Text style={styles.checkboxLabel}>I have, or will have by the deadline: {eligibility.qualification}</Text>
            </Pressable>
          )}

          <Button
            size="lg"
            onPress={() => {
              trackEvent("eligibility_checker_completed", { examCode, ageOk: verdict?.ageOk ?? null });
              setSubmitted(true);
            }}
            disabled={!dob}
            style={styles.submitButton}
          >
            Check Eligibility
          </Button>
        </Card>

        {submitted && dob && verdict && (
          <Card variant="container" style={[styles.card, styles.resultCard]}>
            <View style={styles.resultHeader}>
              <Ionicons
                name={overallEligible ? "checkmark-circle" : "alert-circle"}
                size={22}
                color={overallEligible ? colors.semantic.success : colors.semantic.warning}
              />
              <Text style={[styles.resultHeadline, { color: overallEligible ? colors.semantic.success : colors.semantic.warning }]}>
                {overallEligible ? "You appear eligible" : "You may not be eligible"}
              </Text>
            </View>

            <VerdictRow label="Age" ok={verdict.ageOk} detail={verdict.ageDetail} />
            {eligibility.qualification && (
              <VerdictRow
                label="Qualification"
                ok={qualificationConfirmed ? true : false}
                detail={qualificationConfirmed ? "Self-confirmed." : "Not confirmed — tick the box above."}
              />
            )}
            <VerdictRow label="Category" ok={null} detail={`${labelFor(category)} selected.`} />

            <Text style={styles.disclaimer}>
              This is an informational eligibility check based on the current recruitment notification.
              Final eligibility is determined by the official recruiting authority.
            </Text>
          </Card>
        )}
      </ScrollView>
    </>
  );
}

/** A minimal DD/MM/YYYY text field — kept local since nothing else in the app needs one yet. */
function DobInput({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  return (
    <TextInput
      style={styles.dobInput}
      value={value}
      onChangeText={onChangeText}
      placeholder="DD/MM/YYYY"
      placeholderTextColor={colors.text.muted}
      keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
      maxLength={10}
    />
  );
}

function VerdictRow({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const color = ok === true ? colors.semantic.success : ok === false ? colors.semantic.error : colors.text.muted;
  const icon = ok === true ? "checkmark-circle" : ok === false ? "close-circle" : "information-circle-outline";
  return (
    <View style={styles.verdictRow}>
      <Ionicons name={icon} size={16} color={color} />
      <View style={styles.verdictText}>
        <Text style={styles.verdictLabel}>
          {label}: <Text style={{ color }}>{ok === true ? "Eligible" : ok === false ? "Not eligible" : "Info"}</Text>
        </Text>
        <Text style={styles.verdictDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const buildStyles = ({ colors, spacing: sp, radius: r }: Theme) =>
  StyleSheet.create({
    screen: { flex: 1 },
    centered: { justifyContent: "center", alignItems: "center", padding: sp["2xl"] },
    container: { padding: sp.xl, paddingBottom: sp["3xl"] },
    intro: { fontSize: 14, color: colors.text.secondary, marginBottom: sp.base, lineHeight: 20 },
    card: { padding: sp.lg },
    field: { marginBottom: sp.lg },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.text.primary, marginBottom: sp.sm },
    dobInputRow: { flexDirection: "row" },
    dobInput: {
      flex: 1,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: r.md,
      paddingHorizontal: sp.md,
      paddingVertical: sp.sm + 2,
      fontSize: 15,
      color: colors.text.primary,
    },
    fieldError: { fontSize: 11, color: colors.semantic.error, marginTop: sp.xs },
    categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: sp.sm - 2 },
    categoryChip: {
      paddingHorizontal: sp.md,
      paddingVertical: sp.xs + 3,
      borderRadius: r.pill,
      backgroundColor: colors.surfaceElevated2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipActive: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
    categoryChipText: { fontSize: 12.5, fontWeight: "600", color: colors.text.secondary },
    categoryChipTextActive: { color: colors.text.onAccent },
    checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: sp.sm, marginBottom: sp.lg },
    checkboxLabel: { flex: 1, fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
    submitButton: { marginTop: sp.xs },
    resultCard: { marginTop: sp.base },
    resultHeader: { flexDirection: "row", alignItems: "center", gap: sp.sm, marginBottom: sp.base },
    resultHeadline: { fontSize: 16, fontWeight: "700" },
    verdictRow: { flexDirection: "row", gap: sp.sm, marginBottom: sp.sm + 2 },
    verdictText: { flex: 1 },
    verdictLabel: { fontSize: 13, fontWeight: "600", color: colors.text.primary },
    verdictDetail: { fontSize: 12, color: colors.text.muted, marginTop: 2, lineHeight: 16 },
    disclaimer: { fontSize: 11, color: colors.text.muted, fontStyle: "italic", marginTop: sp.sm, lineHeight: 15 },
  });
