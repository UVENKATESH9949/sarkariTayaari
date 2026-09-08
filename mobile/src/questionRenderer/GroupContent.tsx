import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radius } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";
import { getQuestionGroupContent, type QuestionGroupContent } from "../db/questionGroups";

/**
 * The shared passage/dataset/map a grouped question belongs to (TASK-2301 Phase P3) —
 * rendered above the question text, the same "context before the question" placement
 * PyqBadge already established. Looked up directly from the local group tables by id
 * rather than depending on the assembled question array to carry it (see
 * db/questionGroups.ts's own comment for why): Practice's random sampler has no
 * guarantee every sibling of a group landed in the same session, so this has to work for
 * a single grouped question on its own.
 *
 * Local-only for now — a device mid-first-sync has no local group rows yet, so a grouped
 * question encountered before sync completes renders with no passage above it. Disclosed
 * scope trim, matching this project's existing precedent for "some things wait for
 * sync" gaps elsewhere (e.g. Exam Guide's own offline-cache phase).
 */
/**
 * The caller keys this component on the current question's identity (see call sites in
 * practice/quiz.tsx and mock-test/test.tsx) so React remounts it fresh on every question
 * change — the standard "reset all local state when identity changes" pattern, used
 * instead of an effect that imperatively clears state, which this codebase has
 * repeatedly hit and fixed as a `set-state-in-effect` violation elsewhere (see
 * PreparationPlanCard's own history). A remount means there's nothing to reset here.
 */
export function GroupContent({ questionGroupId, language }: { questionGroupId?: string | null; language: string }) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const t = useT();
  const [content, setContent] = useState<QuestionGroupContent | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [failedMediaId, setFailedMediaId] = useState<string | null>(null);

  useEffect(() => {
    if (!questionGroupId) return;
    let cancelled = false;
    getQuestionGroupContent(questionGroupId).then((result) => {
      if (!cancelled) setContent(result);
    });
    return () => {
      cancelled = true;
    };
  }, [questionGroupId]);

  if (!questionGroupId || !content) return null;

  const passageText = content.translations[language]?.passageText ?? Object.values(content.translations)[0]?.passageText;

  if (!passageText && content.media.length === 0) return null;

  return (
    <View style={styles.box}>
      {passageText && (
        <>
          <Pressable style={styles.header} onPress={() => setCollapsed((c) => !c)}>
            <Text style={styles.headerLabel}>{t("quiz.passageLabel")}</Text>
            <View style={styles.headerRight}>
              <Text style={styles.headerToggle}>{collapsed ? t("quiz.showPassage") : t("quiz.hidePassage")}</Text>
              <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color={colors.brand.primary} />
            </View>
          </Pressable>
          {!collapsed && <Text style={styles.passageText}>{passageText}</Text>}
        </>
      )}

      {content.media.map((media) =>
        media.id === failedMediaId ? null : (
          <Image
            key={media.id}
            source={{ uri: media.localUri ?? media.url }}
            style={styles.media}
            resizeMode="contain"
            onError={() => setFailedMediaId(media.id)}
          />
        ),
      )}
    </View>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    box: {
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.sm + 2,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    headerToggle: {
      fontSize: 13,
      color: colors.brand.primary,
      fontWeight: "600",
    },
    passageText: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 21,
    },
    media: {
      width: "100%",
      height: 200,
      borderRadius: radius.sm,
    },
  });
