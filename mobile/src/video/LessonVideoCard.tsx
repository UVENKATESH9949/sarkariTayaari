import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AiCard } from "../ui/AiCard";
import { spacing } from "../ui/theme";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import {
  downloadLessonVideo,
  resolveLessonVideo,
  type LessonVideoOwner,
  type LessonVideoState,
} from "./lessonVideoCache";

/**
 * The "Watch the lesson" entry point, rendered as an enhancement beside a question's own
 * explanation — never in place of it.
 *
 * <p>The written explanation must remain complete and useful whether or not a video exists, is
 * downloaded, or can be reached. Every branch below therefore either shows something actionable
 * or renders nothing at all; none of them replaces or hides the explanation above.
 *
 * <p>Keyed by the caller on the question's identity, the same way `AiExplanationCard` is, so a
 * question change remounts this fresh rather than needing an effect that imperatively resets
 * state — the `set-state-in-effect` violation this codebase has hit and fixed more than once.
 */
export function LessonVideoCard({
  ownerKind,
  ownerId,
  languageCode,
  title,
}: {
  ownerKind: LessonVideoOwner["kind"];
  ownerId: string;
  languageCode: string;
  title?: string;
}) {
  const styles = useThemedStyles(buildStyles);
  const [state, setState] = useState<LessonVideoState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    resolveLessonVideo({ kind: ownerKind, id: ownerId }, languageCode).then((resolved) => {
      if (!cancelled) setState(resolved);
    });
    return () => {
      cancelled = true;
    };
    // The owner is taken as two primitives rather than an object precisely so this dependency
    // list is honest: an object literal from the caller would be a new identity every render
    // and would re-resolve the video on each one.
  }, [ownerKind, ownerId, languageCode]);

  const handleDownload = useCallback(async () => {
    if (!state || state.kind !== "downloadable") return;
    setDownloading(true);
    setProgress(0);
    const next = await downloadLessonVideo(state.videoId, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) setProgress(bytesWritten / totalBytes);
      },
    });
    setDownloading(false);
    setState(next);
  }, [state]);

  const handlePlay = useCallback(() => {
    if (!state || state.kind !== "ready") return;
    router.push({
      pathname: "/lesson-video",
      params: { localUri: state.localUri, title: title ?? "" },
    });
  }, [state, title]);

  /**
   * Plays directly from the network, without downloading first — for a good connection where
   * waiting for 8MB is worse than just watching. This does not replace the download path: a
   * student on a slow or metered connection still wants "fetch once, watch offline forever",
   * so both actions are offered rather than one replacing the other.
   *
   * <p>Reuses the exact same authenticated stream endpoint the download path already calls —
   * no second backend contract, no weaker entitlement check. The player screen resolves the
   * bearer token itself rather than carrying it through route params, so a token never sits in
   * navigation state.
   */
  const handleStream = useCallback(() => {
    if (!state || state.kind !== "downloadable") return;
    router.push({
      pathname: "/lesson-video",
      params: { streamPath: state.playbackPath, title: title ?? "" },
    });
  }, [state, title]);

  // Still resolving, or nothing to offer. Both render nothing rather than a placeholder: a
  // spinner where most questions will never have a video is noise on every screen.
  if (!state) return null;
  if (state.kind === "none" || state.kind === "signed-out") return null;

  if (state.kind === "offline-unavailable") {
    return (
      <AiCard title="Video lesson" subtitle="Needs a connection to download" style={styles.card}>
        <Text style={styles.body}>
          This lesson isn&apos;t downloaded on your device yet. Connect once to download it, then
          you can watch it any time without internet.
        </Text>
      </AiCard>
    );
  }

  if (state.kind === "preparing") {
    return (
      <AiCard title="Video lesson" subtitle="Preparing your explanation" style={styles.card}>
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={styles.bodyInline}>
            We&apos;re preparing this lesson. Check back in a little while.
          </Text>
        </View>
      </AiCard>
    );
  }

  if (state.kind === "failed") {
    return (
      <AiCard title="Video lesson" subtitle="Couldn&apos;t be prepared" style={styles.card}>
        <Text style={styles.body}>
          We couldn&apos;t prepare a video for this one. The written explanation above still has
          everything you need.
        </Text>
      </AiCard>
    );
  }

  if (state.kind === "locked") {
    return (
      <AiCard title="Video lesson" subtitle="Premium" style={styles.card}>
        <Text style={styles.body}>
          A {formatDuration(state.durationSeconds)} video lesson is available with premium.
        </Text>
      </AiCard>
    );
  }

  const subtitle =
    state.resolvedVia === "TOPIC"
      ? "Covers this topic"
      : "Made for this question";

  return (
    <AiCard title="Video lesson" subtitle={subtitle} style={styles.card}>
      {state.kind === "ready" ? (
        <Pressable style={styles.action} onPress={handlePlay} accessibilityRole="button">
          <Ionicons name="play-circle" size={28} style={styles.icon} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Watch the lesson</Text>
            <Text style={styles.actionMeta}>
              {formatDuration(state.durationSeconds)} · saved on your device
            </Text>
          </View>
        </Pressable>
      ) : (
        <>
          <Pressable style={styles.action} onPress={handleStream} accessibilityRole="button">
            <Ionicons name="play-circle" size={28} style={styles.icon} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Play now</Text>
              <Text style={styles.actionMeta}>
                {formatDuration(state.durationSeconds)} · streams over your connection
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.action, styles.secondaryAction]}
            onPress={handleDownload}
            disabled={downloading}
            accessibilityRole="button"
          >
            {downloading ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="download-outline" size={22} style={styles.iconMuted} />
            )}
            <View style={styles.actionText}>
              <Text style={styles.secondaryActionTitle}>
                {downloading ? `Downloading… ${Math.round(progress * 100)}%` : "Download for offline"}
              </Text>
              <Text style={styles.actionMeta}>
                {state.sizeBytes ? `${(state.sizeBytes / (1024 * 1024)).toFixed(1)} MB · ` : ""}
                watch without a connection later
              </Text>
            </View>
          </Pressable>
        </>
      )}
    </AiCard>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "Video";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    card: {
      marginTop: spacing.sm,
    },
    body: {
      color: colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    bodyInline: {
      color: colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
      flex: 1,
      marginLeft: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    action: {
      flexDirection: "row",
      alignItems: "center",
    },
    secondaryAction: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    icon: {
      color: colors.brand.primary,
    },
    iconMuted: {
      color: colors.text.muted,
    },
    actionText: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    actionTitle: {
      color: colors.text.primary,
      fontSize: 15,
      fontWeight: "600",
    },
    secondaryActionTitle: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: "500",
    },
    actionMeta: {
      color: colors.text.muted,
      fontSize: 13,
      marginTop: 2,
    },
  });
}
