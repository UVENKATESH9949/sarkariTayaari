import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../practice/authContext";
import { useSessionHistory } from "../../practice/sessionHistory";
import { LANGUAGES, useAppLanguage } from "../../practice/appLanguage";
import { LanguagePickerModal } from "../../practice/LanguagePickerModal";
import { useSyncStatus } from "../../sync/SyncContext";
import { AppAlert } from "../../ui/AppDialog";
import { Card, CardDivider, CardRow } from "../../ui/Card";
import { SectionLabel } from "../../ui/SectionLabel";
import { spacing } from "../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../ui/ThemeContext";
import { useT } from "../../i18n/I18nContext";

// Takes `t`: module-scope helper, no hooks available. The date/time formatting itself
// stays on the platform's Intl output, which already follows the device locale — the app
// language should change the surrounding words, not reformat the clock.
function formatLastSynced(date: Date, t: ReturnType<typeof useT>): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return t("more.today", { time });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t("more.yesterday", { time });
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}


export default function More() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { clearSessions } = useSessionHistory();
  const { defaultLanguageCode, setDefaultLanguageCode } = useAppLanguage();
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const { status, synced, total, lastSyncedAt, isRefreshing, refreshError, syncNow } = useSyncStatus();

  const isSyncing = status === "checking" || status === "syncing" || status === "partial" || isRefreshing;
  // Initial sync retries indefinitely on its own (see runInitialSyncUntilDone), so
  // status never settles on "error" for it — only a delta-sync check-for-updates
  // failure can still land here, and existing offline content is unaffected by it.
  const hasFailed = !isSyncing && refreshError !== null;
  const percent = total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : 0;
  const [manualSyncing, setManualSyncing] = useState(false);

  const handleSyncNow = () => {
    setManualSyncing(true);
    syncNow().finally(() => setManualSyncing(false));
  };

  const defaultLanguageName = LANGUAGES.find((l) => l.code === defaultLanguageCode)?.name ?? "English";

  const handleClearHistory = () => {
    AppAlert.alert(
      t("more.clearHistoryTitle"),
      t("more.clearHistoryMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.clear"), style: "destructive", onPress: clearSessions },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>{t("more.title")}</Text>

      <SectionLabel label={t("more.account")} />
      <Card variant="container" style={styles.card}>
        <CardRow
          icon={user ? "person-circle-outline" : "cloud-upload-outline"}
          label={user ? t("more.yourAccount") : t("more.saveProgress")}
          value={user ? user.email : t("more.notSignedIn")}
          onPress={() => router.push("/account")}
        />
      </Card>

      {/* Exam Guide spec §39/§65/§72's "More → Progress" access path — the tab bar entry
          was removed (see _layout.tsx), so this and Home's readiness card are now the two
          required ways in. Same screen, same data; nothing about Progress itself changed. */}
      <SectionLabel label={t("more.study")} style={styles.sectionSpacing} />
      <Card variant="container" style={styles.card}>
        <CardRow
          icon="star-outline"
          label="My Exams"
          value="Follow exams, discover new ones"
          onPress={() => router.push("/my-exams")}
        />
        <CardDivider />
        <CardRow
          icon="stats-chart-outline"
          label={t("nav.progress")}
          value={t("more.progressValue")}
          onPress={() => router.push("/progress")}
        />
      </Card>

      <SectionLabel label={t("more.preferences")} style={styles.sectionSpacing} />
      <Card variant="container" style={styles.card}>
        <CardRow
          icon="color-palette-outline"
          label={t("more.appearanceAndLanguage")}
          value={t("more.appearanceValue")}
          onPress={() => router.push("/settings")}
        />
        <CardDivider />
        {/* Kept separate from the app language above, and deliberately so: this picks which
            translation of the QUESTIONS to show, which is exam content and a different
            decision from which language the app's own labels are in. Doc 2 §11 draws the
            same line. */}
        <CardRow
          icon="language-outline"
          label={t("more.quizLanguage")}
          value={defaultLanguageName}
          onPress={() => setLanguagePickerVisible(true)}
        />
      </Card>

      <SectionLabel label={t("more.data")} style={styles.sectionSpacing} />
      <Card variant="container" style={styles.card}>
        {isSyncing ? (
          <View style={styles.row}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="sync-outline" size={18} color={colors.brand.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>
                {status === "checking" ? t("more.syncPreparing") : isRefreshing ? t("more.syncChecking") : t("more.syncDownloading")}
              </Text>
              {status === "syncing" || status === "partial" ? (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${percent}%` }]} />
                  </View>
                  <Text style={styles.rowValue}>
                    {total > 0
                      ? t("more.syncProgress", {
                          percent,
                          synced: synced.toLocaleString(),
                          total: total.toLocaleString(),
                        })
                      : "Starting..."}
                  </Text>
                </>
              ) : (
                <Text style={styles.rowValue}>{t("more.syncKeepUsing")}</Text>
              )}
            </View>
          </View>
        ) : hasFailed ? (
          <Pressable style={styles.row} onPress={handleSyncNow} disabled={manualSyncing}>
            <View style={[styles.rowIconCircle, styles.rowIconCircleDanger]}>
              <Ionicons name="warning-outline" size={18} color={colors.semantic.error} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowLabel, styles.rowLabelDanger]}>{t("more.syncFailed")}</Text>
              <Text style={styles.rowValue}>
                {refreshError ?? t("more.syncFailedBody")}
              </Text>
            </View>
            <Text style={styles.actionText}>{manualSyncing ? t("more.syncRetrying") : t("common.retry")}</Text>
          </Pressable>
        ) : lastSyncedAt !== null ? (
          <Pressable style={styles.row} onPress={handleSyncNow} disabled={manualSyncing}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.brand.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>{t("more.syncUpToDate")}</Text>
              <Text style={styles.rowValue}>{t("more.syncLastSynced", { when: formatLastSynced(lastSyncedAt, t) })}</Text>
            </View>
            <Text style={styles.actionText}>{manualSyncing ? t("more.syncing") : t("more.syncNow")}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.row} onPress={handleSyncNow} disabled={manualSyncing}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="cloud-download-outline" size={18} color={colors.brand.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>{t("more.notDownloaded")}</Text>
              <Text style={styles.rowValue}>{t("more.notDownloadedBody")}</Text>
            </View>
            <Text style={styles.actionText}>{manualSyncing ? t("more.syncStarting") : t("more.syncNow")}</Text>
          </Pressable>
        )}
        <CardDivider />
        <CardRow
          icon="trash-outline"
          iconColor={colors.semantic.error}
          iconBg={colors.semantic.errorBg}
          label={t("more.clearHistory")}
          labelColor={colors.semantic.error}
          value={t("more.clearHistoryValue")}
          onPress={handleClearHistory}
          trailing={false}
        />
      </Card>

      <SectionLabel label={t("more.about")} style={styles.sectionSpacing} />
      <Card variant="container" style={styles.card}>
        <CardRow icon="information-circle-outline" label={t("common.appName")} value={t("more.version", { version: "0.1.0" })} />
      </Card>

      <LanguagePickerModal
        visible={languagePickerVisible}
        selectedCode={defaultLanguageCode}
        onSelect={setDefaultLanguageCode}
        onClose={() => setLanguagePickerVisible(false)}
        title={t("languagePicker.quizLanguageTitle")}
      />
    </ScrollView>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    title: {
      ...typography.pageTitle,
      marginBottom: spacing.lg,
    },
    sectionSpacing: {
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    card: {
      marginTop: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md + 2,
    },
    rowIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceElevated2,
      alignItems: "center",
      justifyContent: "center",
    },
    rowIconCircleDanger: {
      backgroundColor: colors.semantic.errorBg,
    },
    rowInfo: {
      flex: 1,
    },
    rowLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    rowLabelDanger: {
      color: colors.semantic.error,
    },
    rowValue: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surfaceElevated2,
      marginTop: spacing.sm,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: colors.brand.primary,
    },
    actionText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.brand.primary,
    },
  });
