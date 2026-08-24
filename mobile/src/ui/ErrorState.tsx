import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./Button";
import { colors, spacing, typography } from "./theme";

type ErrorStateProps = {
  title: string;
  /** Human copy only — never a raw API error message. */
  body?: string;
  /** Always wraps a real retry (e.g. syncNow, or a query refetch). */
  onRetry?: () => void;
};

/** Generic error-state — replaces the one ad hoc "couldn't load" pattern per screen. */
export function ErrorState({ title, body, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="warning-outline" size={28} color={colors.semantic.error} />
      </View>
      <Text style={[typography.cardTitle, styles.title]}>{title}</Text>
      {body ? <Text style={[typography.secondary, styles.body]}>{body}</Text> : null}
      {onRetry ? (
        <Button variant="secondary" onPress={onRetry} style={styles.action}>
          Try Again
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing["3xl"],
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.semantic.errorBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.base,
  },
  title: {
    textAlign: "center",
  },
  body: {
    textAlign: "center",
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.lg,
  },
});
