import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../ui/PressableScale";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

/**
 * One selectable answer in the onboarding flow.
 *
 * Every step that offers a choice renders these, so selection looks and behaves identically
 * whether the student is picking a language, an exam, a stage or a study-time band. Built on
 * `PressableScale` and the shared tokens rather than a new visual language — the app already
 * has one.
 *
 * The whole card is the target, at a minimum height above the 44pt guideline, because a
 * first-time user tapping a radio dot the size of a full stop is the single most common way a
 * form like this feels cheap.
 */
export function OnboardingOption({
  title,
  description,
  meta,
  selected,
  multi,
  atLimit,
  onPress,
}: {
  title: string;
  description?: string;
  /** A short trailing fact, e.g. an exam's question count. Never the selection state. */
  meta?: string;
  selected: boolean;
  /**
   * Multi-select renders a checkbox and announces itself as one. The distinction is not
   * decoration: a radio tells the student "choosing this replaces your answer" and a checkbox
   * tells them "this adds to it", which is exactly the difference between the app-language step
   * and the content-language step sitting next to each other in the same flow.
   */
  multi?: boolean;
  /**
   * Dimmed, but still tappable — used at the content-language cap. The tap is what produces the
   * "you can select up to 2" explanation, so making it genuinely inert would remove the only
   * feedback the student gets.
   */
  atLimit?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);

  const icon = multi
    ? selected
      ? "checkbox"
      : "square-outline"
    : selected
      ? "radio-button-on"
      : "radio-button-off";

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={[styles.card, selected && styles.cardSelected, atLimit && styles.cardAtLimit]}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      <Ionicons
        name={icon}
        size={20}
        color={selected ? colors.brand.light : colors.text.muted}
      />
      <View style={styles.textBlock}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </PressableScale>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    cardSelected: {
      borderColor: colors.brand.light,
      backgroundColor: colors.brand.glowSoft,
    },
    // Dimmed, not disabled — see `atLimit`. An inert control that explains nothing would be
    // worse than a refusal that does.
    cardAtLimit: {
      opacity: 0.45,
    },
    textBlock: {
      flex: 1,
    },
    title: {
      ...typography.cardTitle,
    },
    titleSelected: {
      color: colors.brand.light,
    },
    description: {
      ...typography.secondary,
      marginTop: 2,
    },
    meta: {
      ...typography.caption,
    },
  });
