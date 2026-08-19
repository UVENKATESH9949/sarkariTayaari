import * as Sentry from "@sentry/react-native";
import { usePathname } from "expo-router";
import { useEffect } from "react";

/**
 * Basic analytics as Sentry breadcrumbs, not a dedicated analytics platform — no vendor
 * is in use yet (see reports/open-questions.md). This gives the crash-context timeline
 * real meaning (what the user was doing right before a crash) rather than adding a
 * second telemetry system before the product has enough users to need one.
 */
export function trackEvent(name: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({ category: "app", message: name, data, level: "info" });
}

/** Reports a caught error to Sentry instead of only logging it locally. */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Fires a "screen_view" breadcrumb whenever the current route changes. */
export function useScreenViewTracking() {
  const pathname = usePathname();

  useEffect(() => {
    trackEvent("screen_view", { path: pathname });
  }, [pathname]);
}
