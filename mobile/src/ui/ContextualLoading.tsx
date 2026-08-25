import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LoadingMark } from "./LoadingMark";
import { spacing, typography } from "./theme";

type ContextualLoadingProps = {
  /** What's actually happening, e.g. "Preparing topics for SSC CGL..." — never generic "Loading...". */
  message: string;
  /** A skeleton shaped like the content about to appear (ListSkeleton/CardSkeleton/QuestionSkeleton). */
  skeleton: ReactNode;
};

/**
 * Level 2/3 loading (spec Features 2/3): secondary/deeper navigation the user just
 * asked for, where a short wait is expected — a compact LoadingMark (bold wordmark +
 * glowing indeterminate bar, no fabricated percentage since these reads have no real
 * synced/total count) + a specific message, over a skeleton shaped like the real content.
 * Root/landing screens (Level 1, meant to be near-instant off cache) use a bare Skeleton
 * directly instead — this component is deliberately not used there, so it can't become
 * the generic "Loading..." spinner the spec explicitly warns against.
 */
export function ContextualLoading({ message, skeleton }: ContextualLoadingProps) {
  return (
    <View style={styles.container}>
      <LoadingMark label="PREPARING" size="compact" />
      <Text style={styles.message}>{message}</Text>
      <View style={styles.skeletonWrap}>{skeleton}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  message: {
    ...typography.secondary,
    textAlign: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  skeletonWrap: {
    width: "100%",
  },
});
