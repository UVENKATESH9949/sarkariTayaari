import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IoniconName } from "../constants/subjects";
import { DonutRing } from "./DonutRing";
import { IconBox } from "./IconBox";
import { PressableScale } from "./PressableScale";
import { radius, spacing } from "./theme";
import { useTheme, useThemedStyles, type Theme } from "./ThemeContext";

/**
 * The shared visual language for every AI surface in the app.
 *
 * Before this, each AI surface had grown its own one-off box — Practice Summary, Mock Test
 * Result, Preparation Radar, the question explanation and the mistake analysis were five
 * separately-written `View`s that happened to share a sparkle icon. They are the same product
 * idea and now read as one: a bordered brand-tinted card with a titled header, an optional
 * score ring, an optional focus row, optional next-step tiles and an optional highlighted tip.
 *
 * Three rules this file exists to enforce, not just to centralise styling:
 *
 *  1. **Nothing here invents a fact.** Every number, topic name and count a caller passes in
 *     comes from data the screen already renders correctly on its own. These components take
 *     no responsibility for content — a caller with nothing real to put in a slot omits it,
 *     and the card composes fine without it.
 *  2. **Theme tokens only.** These cards appear on both palettes; the reference design was
 *     drawn light, so every surface here is a token role (`brand.glowSoft`, `semantic.*Bg`)
 *     rather than a literal colour, and the tinted grounds stay legible in dark.
 *  3. **Every `fontSize` lives in the style factory**, never inline, so `useThemedStyles`
 *     applies the zoom preference to all of it (see the note in `ThemeContext.tsx`).
 *
 * Tier-2 behaviour is unchanged and stays the caller's job: an AI surface with nothing to say
 * renders nothing at all, and the screen underneath must look correct without it.
 */

export type AiTone = "brand" | "success" | "warning" | "danger" | "neutral";

/**
 * Resolves a tone to a foreground/background pair. Semantic colours differ between the two
 * palettes, so this takes the live palette rather than being a module constant.
 */
function toneColors(tone: AiTone, colors: Theme["colors"]): { fg: string; bg: string } {
  switch (tone) {
    case "success":
      return { fg: colors.semantic.success, bg: colors.semantic.successBg };
    case "warning":
      return { fg: colors.semantic.warning, bg: colors.semantic.warningBg };
    case "danger":
      return { fg: colors.semantic.error, bg: colors.semantic.errorBg };
    case "neutral":
      return { fg: colors.text.secondary, bg: colors.surfaceElevated2 };
    case "brand":
    default:
      return { fg: colors.brand.light, bg: colors.brand.glowSoft };
  }
}

type AiCardProps = {
  title: string;
  subtitle?: string;
  /** Small right-aligned status pill. Derived from real data by the caller, never decorative. */
  badge?: { label: string; icon?: IoniconName; tone?: AiTone };
  /** Centred small-caps line between two hairline rules. */
  footer?: string;
  footerIcon?: IoniconName;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** The card shell: header (sparkle mark, title, subtitle, optional pill), body slots, optional footer. */
export function AiCard({ title, subtitle, badge, footer, footerIcon = "flag", style, children }: AiCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const badgeTone = toneColors(badge?.tone ?? "brand", colors);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <IconBox
          icon="sparkles"
          size={38}
          iconSize={20}
          backgroundColor={colors.brand.glowSoft}
          iconColor={colors.brand.light}
        />
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badgeTone.bg }]}>
            {badge.icon ? <Ionicons name={badge.icon} size={13} color={badgeTone.fg} /> : null}
            <Text style={[styles.badgeText, { color: badgeTone.fg }]}>{badge.label}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>{children}</View>

      {footer ? (
        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <Ionicons name={footerIcon} size={13} color={colors.brand.light} />
          <Text style={styles.footerText}>{footer}</Text>
          <View style={styles.footerRule} />
        </View>
      ) : null}
    </View>
  );
}

type AiScoreSummaryProps = {
  /** 0-100. Omit when the surface has no honest score — the headline and body then run full width. */
  percent?: number;
  /** Caption under the ring, e.g. "Correct". */
  ringCaption?: string;
  headline?: string;
  /** The model's own narrative, usually. Rendered as the card's body copy. */
  body: string;
};

/** Ring + headline + narrative — the top block of the card. */
export function AiScoreSummary({ percent, ringCaption, headline, body }: AiScoreSummaryProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);

  if (percent === undefined) {
    return (
      <View>
        {headline ? <Text style={styles.headline}>{headline}</Text> : null}
        <Text style={[styles.bodyText, headline ? styles.bodyTextSpaced : null]}>{body}</Text>
      </View>
    );
  }

  return (
    <View style={styles.summaryRow}>
      <View style={styles.ringColumn}>
        <DonutRing percent={percent} size={86} strokeWidth={9} fillColor={colors.brand.bright} />
        {ringCaption ? <Text style={styles.ringCaption}>{ringCaption}</Text> : null}
      </View>
      <View style={styles.summaryTextColumn}>
        {headline ? <Text style={styles.headline}>{headline}</Text> : null}
        <Text style={[styles.bodyText, headline ? styles.bodyTextSpaced : null]}>{body}</Text>
      </View>
    </View>
  );
}

type AiFocusRowProps = {
  /** Small-caps eyebrow, e.g. "Focus area". */
  label: string;
  title: string;
  subtitle?: string;
  icon: IoniconName;
  tone?: AiTone;
  /** Omit when there is nowhere real to go — the row then renders flat, with no chevron and no tap affordance. */
  onPress?: () => void;
};

/** The single highlighted "here is where to look" row. */
export function AiFocusRow({ label, title, subtitle, icon, tone = "brand", onPress }: AiFocusRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const { fg, bg } = toneColors(tone, colors);

  const content = (
    <>
      <IconBox icon={icon} size={44} iconSize={22} backgroundColor={bg} iconColor={fg} />
      <View style={styles.focusText}>
        <Text style={[styles.focusLabel, { color: fg }]}>{label}</Text>
        <Text style={styles.focusTitle}>{title}</Text>
        {subtitle ? <Text style={styles.focusSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.text.muted} /> : null}
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${label}: ${title}, ${subtitle}` : `${label}: ${title}`}
        style={[styles.focusRow, { backgroundColor: bg }]}
      >
        {content}
      </PressableScale>
    );
  }
  return <View style={[styles.focusRow, { backgroundColor: bg }]}>{content}</View>;
}

export type AiTileItem = {
  icon: IoniconName;
  title: string;
  body: string;
  tone?: AiTone;
};

type AiTilesProps = {
  /** Section heading, e.g. "What to focus on". Omit for an unlabelled tile row. */
  heading?: string;
  headingIcon?: IoniconName;
  items: AiTileItem[];
};

/**
 * The tinted tile row.
 *
 * Tiles wrap rather than forcing a fixed three-across grid: three fit one row on an ordinary
 * phone, but a longer string — a translated one, or a zoomed-up font — reflows to two or one
 * per row instead of clipping. That is why `flexBasis`/`minWidth` are used here rather than
 * the fixed percentage width the mockup implies.
 */
export function AiTiles({ heading, headingIcon = "bulb", items }: AiTilesProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  if (items.length === 0) return null;

  return (
    <View>
      {heading ? (
        <View style={styles.tilesHeading}>
          <Ionicons name={headingIcon} size={17} color={colors.semantic.warning} />
          <Text style={styles.tilesHeadingText}>{heading}</Text>
        </View>
      ) : null}
      <View style={styles.tilesRow}>
        {items.map((item) => {
          const { fg, bg } = toneColors(item.tone ?? "brand", colors);
          return (
            <View key={item.title} style={[styles.tile, { backgroundColor: bg }]}>
              <Ionicons name={item.icon} size={19} color={fg} />
              <Text style={styles.tileTitle}>{item.title}</Text>
              <Text style={styles.tileBody}>{item.body}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export type AiBulletItem = {
  /** A short leading chip — an option letter, a step number. */
  label: string;
  text: string;
  tone?: AiTone;
};

/**
 * A labelled list for content that is too long to tile: the per-option "why this one is wrong"
 * lines, where squeezing three sentences into three narrow columns would be unreadable.
 */
export function AiBulletList({ heading, items }: { heading?: string; items: AiBulletItem[] }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  if (items.length === 0) return null;

  return (
    <View>
      {heading ? <Text style={styles.listHeading}>{heading}</Text> : null}
      <View style={styles.list}>
        {items.map((item) => {
          const { fg, bg } = toneColors(item.tone ?? "neutral", colors);
          return (
            <View key={`${item.label}-${item.text}`} style={styles.listRow}>
              <View style={[styles.listChip, { backgroundColor: bg }]}>
                <Text style={[styles.listChipText, { color: fg }]}>{item.label}</Text>
              </View>
              <Text style={styles.listText}>{item.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

type AiTipStripProps = {
  label: string;
  text: string;
  icon?: IoniconName;
  tone?: AiTone;
};

/**
 * The accent-barred highlight at the foot of a card — used for real model output (an exam tip,
 * a suggested next action), never for filler.
 */
export function AiTipStrip({ label, text, icon = "sparkles", tone = "brand" }: AiTipStripProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const { fg, bg } = toneColors(tone, colors);

  return (
    <View style={[styles.tip, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} />
      <View style={[styles.tipBar, { backgroundColor: fg }]} />
      <View style={styles.tipText}>
        <Text style={[styles.tipLabel, { color: fg }]}>{label}</Text>
        <Text style={styles.tipBody}>{text}</Text>
      </View>
    </View>
  );
}

/**
 * The tap-to-generate affordance for an AI surface that costs a real model call, so it is
 * never generated unasked (see `MistakeAnalysisCard`). Styled as a tinted button rather than a
 * primary one: it is an offer, not the screen's main action.
 */
export function AiAskButton({
  label,
  loading,
  onPress,
  icon = "sparkles",
}: {
  label: string;
  loading?: boolean;
  onPress: () => void;
  icon?: IoniconName;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  return (
    <PressableScale
      onPress={onPress}
      disabled={loading}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.askButton, loading ? styles.askButtonLoading : null]}
    >
      <Ionicons name={loading ? "hourglass-outline" : icon} size={16} color={colors.brand.light} />
      <Text style={styles.askButtonText}>{label}</Text>
    </PressableScale>
  );
}

const buildStyles = ({ colors, shadow }: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius["2xl"],
      borderWidth: 1,
      borderColor: colors.borderAccent,
      padding: spacing.base,
      gap: spacing.base,
      ...shadow.card,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 19,
      fontWeight: "800",
      lineHeight: 24,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.text.secondary,
      marginTop: 1,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radius.pill,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "700",
    },
    body: {
      gap: spacing.base,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.base,
    },
    ringColumn: {
      alignItems: "center",
      gap: spacing.xs,
    },
    ringCaption: {
      fontSize: 11.5,
      fontWeight: "600",
      color: colors.text.muted,
    },
    summaryTextColumn: {
      flex: 1,
    },
    headline: {
      fontSize: 16,
      fontWeight: "800",
      lineHeight: 22,
      color: colors.text.primary,
    },
    bodyText: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.text.secondary,
    },
    bodyTextSpaced: {
      marginTop: spacing.sm,
    },
    focusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.xl,
    },
    focusText: {
      flex: 1,
    },
    focusLabel: {
      fontSize: 10.5,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    focusTitle: {
      fontSize: 15.5,
      fontWeight: "700",
      lineHeight: 21,
      color: colors.text.primary,
      marginTop: 2,
    },
    focusSubtitle: {
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.text.secondary,
      marginTop: 1,
    },
    tilesHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    tilesHeadingText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    tilesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    tile: {
      flexGrow: 1,
      flexBasis: "30%",
      minWidth: 96,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.xs,
    },
    tileTitle: {
      fontSize: 12.5,
      fontWeight: "700",
      lineHeight: 17,
      color: colors.text.primary,
    },
    tileBody: {
      fontSize: 11.5,
      lineHeight: 16,
      color: colors.text.secondary,
    },
    listHeading: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    list: {
      gap: spacing.sm,
    },
    listRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    listChip: {
      minWidth: 24,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.sm,
      alignItems: "center",
    },
    listChipText: {
      fontSize: 12,
      fontWeight: "700",
    },
    listText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.text.secondary,
    },
    tip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.xl,
    },
    tipBar: {
      width: 3,
      alignSelf: "stretch",
      borderRadius: radius.pill,
      opacity: 0.45,
    },
    tipText: {
      flex: 1,
    },
    tipLabel: {
      fontSize: 10.5,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      marginBottom: 3,
    },
    tipBody: {
      fontSize: 13.5,
      lineHeight: 19,
      color: colors.text.primary,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    footerRule: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    footerText: {
      fontSize: 10.5,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      color: colors.text.muted,
    },
    askButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.borderAccent,
      backgroundColor: colors.brand.glowSoft,
    },
    askButtonLoading: {
      opacity: 0.7,
    },
    askButtonText: {
      fontSize: 13.5,
      fontWeight: "700",
      color: colors.brand.light,
    },
  });
