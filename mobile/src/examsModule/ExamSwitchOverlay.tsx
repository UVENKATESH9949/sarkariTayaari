import { Modal, StyleSheet, Text, View } from "react-native";
import { useActiveExam } from "./activeExamContext";
import { LoadingMark } from "../ui/LoadingMark";
import { spacing } from "../ui/theme";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

/**
 * The blocking transition shown while the active exam is being switched.
 *
 * Mounted once at the app root beside `AppDialogHost`, and driven entirely by
 * `activeExamContext`'s `switchingTo` — so every switching affordance in the app gets this
 * automatically, and none of them has to render (or forget to render) a loading state.
 *
 * A `Modal` rather than an absolutely-positioned view, for one specific reason: it is the only
 * thing in React Native that reliably covers the tab bar as well as the screen. "The underlying
 * application should not be interactive during this transition" is not true of an overlay the
 * tab bar still sits on top of.
 *
 * It stays up exactly as long as the switch takes — see `MIN_OVERLAY_MS` in
 * `activeExamContext.tsx` for the one deliberate exception, a sub-frame anti-flash floor.
 */
export function ExamSwitchOverlay() {
  const { switchingTo } = useActiveExam();
  const styles = useThemedStyles(buildStyles);
  const t = useT();

  return (
    <Modal visible={switchingTo !== null} transparent={false} animationType="fade" statusBarTranslucent>
      <View style={styles.screen}>
        <LoadingMark label="SWITCHING" size="hero" />
        <Text style={styles.title}>{t("exams.switchingTitle")}</Text>
        {/* The exam name is the whole point of this screen: it is the only confirmation the
            user gets that the app understood which exam they tapped. */}
        <Text style={styles.subtitle}>{t("exams.switchingTo", { exam: switchingTo?.name ?? "" })}</Text>
      </View>
    </Modal>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      padding: spacing.xl,
      gap: spacing.md,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
      textAlign: "center",
      marginTop: spacing.lg,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.secondary,
      textAlign: "center",
    },
  });
