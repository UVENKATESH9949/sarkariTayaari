import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useI18n, useT } from "../i18n/I18nContext";
import { Card } from "../ui/Card";
import { SectionLabel } from "../ui/SectionLabel";
import { spacing, radius } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

/**
 * Appearance and language, all three of the preferences added by Doc 2 §9/§10/§11.
 *
 * A screen of its own rather than more rows on More, as §13 allows: each of the three needs
 * a control rather than a value-and-chevron row, and the text-size control in particular
 * needs the live sample underneath it to be worth anything. More links here.
 */
export default function Settings() {
  const t = useT();
  const { language, setLanguage } = useI18n();
  const { colors, mode, setThemeMode, zoom, stepZoom, resetZoom, canZoomIn, canZoomOut } = useTheme();
  const styles = useThemedStyles(buildStyles);

  const zoomPercent = Math.round(zoom * 100);
  const isDefaultZoom = zoom === 1;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionLabel label={t("settings.appearance")} />

      <Card variant="container" style={styles.card}>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>{t("settings.theme")}</Text>
          <View style={styles.segmented}>
            <Segment
              icon="moon-outline"
              label={t("settings.themeDark")}
              selected={mode === "dark"}
              onPress={() => setThemeMode("dark")}
            />
            <Segment
              icon="sunny-outline"
              label={t("settings.themeLight")}
              selected={mode === "light"}
              onPress={() => setThemeMode("light")}
            />
          </View>
        </View>
      </Card>

      <Card variant="container" style={styles.card}>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>{t("settings.textSize")}</Text>
          <Text style={styles.blockHint}>{t("settings.textSizeHint")}</Text>

          <View style={styles.zoomRow}>
            <Pressable
              style={[styles.zoomButton, !canZoomOut && styles.zoomButtonDisabled]}
              onPress={() => stepZoom(-1)}
              disabled={!canZoomOut}
              accessibilityRole="button"
              accessibilityLabel={t("settings.zoomOut")}
              accessibilityState={{ disabled: !canZoomOut }}
            >
              <Ionicons name="remove" size={20} color={canZoomOut ? colors.brand.light : colors.text.muted} />
            </Pressable>

            {/* The percentage is the accessible value as well as the visible one — the two
                buttons are icon-only, so without this the control would announce nothing
                about what it is currently set to. */}
            <Text style={styles.zoomValue} accessibilityLiveRegion="polite">
              {zoomPercent}%
            </Text>

            <Pressable
              style={[styles.zoomButton, !canZoomIn && styles.zoomButtonDisabled]}
              onPress={() => stepZoom(1)}
              disabled={!canZoomIn}
              accessibilityRole="button"
              accessibilityLabel={t("settings.zoomIn")}
              accessibilityState={{ disabled: !canZoomIn }}
            >
              <Ionicons name="add" size={20} color={canZoomIn ? colors.brand.light : colors.text.muted} />
            </Pressable>

            <Pressable
              style={styles.resetButton}
              onPress={resetZoom}
              disabled={isDefaultZoom}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDefaultZoom }}
            >
              <Text style={[styles.resetText, isDefaultZoom && styles.resetTextDisabled]}>{t("settings.reset")}</Text>
            </Pressable>
          </View>

          {/* Deliberately styled like a real question stem rather than as body text: the
              only question worth answering here is "will the quiz still be readable", and
              a sample in caption size would not answer it. */}
          <View style={styles.sampleBox}>
            <Text style={styles.sampleText}>{t("settings.sample")}</Text>
          </View>
        </View>
      </Card>

      <SectionLabel label={t("settings.language")} style={styles.sectionSpacing} />

      <Card variant="container" style={styles.card}>
        <View style={styles.block}>
          <Text style={styles.blockHint}>{t("settings.languageHint")}</Text>
          <View style={styles.segmented}>
            <Segment
              label={t("settings.languageEnglish")}
              selected={language === "en"}
              onPress={() => setLanguage("en")}
            />
            <Segment
              label={t("settings.languageTelugu")}
              selected={language === "te"}
              onPress={() => setLanguage("te")}
            />
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

/**
 * One option in a two-up segmented control.
 *
 * `accessibilityRole="radio"` with `checked` rather than a plain button: the selection is
 * conveyed visually by fill and border, and Doc 2 §52 requires that state not depend on
 * seeing it. A screen reader now announces "selected" instead of just the label.
 */
function Segment({
  icon,
  label,
  selected,
  onPress,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);

  return (
    <Pressable
      style={[styles.segment, selected && styles.segmentSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      {icon ? (
        <Ionicons name={icon} size={16} color={selected ? colors.text.onAccent : colors.text.secondary} />
      ) : null}
      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    card: {
      marginTop: spacing.sm,
    },
    sectionSpacing: {
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    block: {
      padding: spacing.base,
    },
    blockLabel: {
      ...typography.cardTitle,
    },
    blockHint: {
      ...typography.caption,
      marginTop: spacing.xs,
      lineHeight: 17,
    },
    segmented: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    segment: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm - 2,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated2,
    },
    segmentSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    segmentTextSelected: {
      color: colors.text.onAccent,
    },
    zoomRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginTop: spacing.base,
    },
    zoomButton: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated2,
      alignItems: "center",
      justifyContent: "center",
    },
    zoomButtonDisabled: {
      opacity: 0.45,
    },
    zoomValue: {
      minWidth: 56,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    resetButton: {
      marginLeft: "auto",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    resetText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.brand.light,
    },
    resetTextDisabled: {
      color: colors.text.muted,
    },
    sampleBox: {
      marginTop: spacing.base,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated2,
    },
    sampleText: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text.primary,
      lineHeight: 26,
    },
  });
