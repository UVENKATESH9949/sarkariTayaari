import { useEffect } from "react";
import { BackHandler } from "react-native";
import { AppAlert } from "../ui/AppDialog";

/**
 * Makes the Android hardware Back button and the Back gesture obey the same rule as a
 * tab switch while a Practice quiz or Mock Test is in progress.
 *
 * ## Why one listener covers both the button and the gesture
 *
 * `app.json` sets `android.predictiveBackGestureEnabled: false`, which lands in the
 * manifest as `android:enableOnBackInvokedCallback="false"`. With predictive back off,
 * Android routes the swipe gesture through the legacy `onBackPressed` path, and React
 * Native surfaces that as `hardwareBackPress` — the same event as the button. So a single
 * subscription genuinely satisfies Doc 2 §2's requirement that no navigation method
 * bypass the behaviour implemented for another.
 *
 * That is a real dependency, not an incidental one: if predictive back is ever turned on,
 * the gesture starts going through `OnBackInvokedCallback` instead and this hook stops
 * seeing it. Anyone flipping that flag has to revisit this file.
 *
 * ## Why it is conditional on `active`
 *
 * Registering unconditionally and checking inside the handler would work, but leaving the
 * subscription off entirely while no test is running means a screen the user has already
 * left cannot possibly intercept their Back press — which is the class of bug §3 is about.
 * Returning `false` from the handler (or not being registered at all) lets the navigator
 * handle Back normally.
 */
export function useActiveTestBackGuard({
  active,
  title,
  message,
  onConfirmLeave,
}: {
  /** True only while the test is genuinely in progress. */
  active: boolean;
  title: string;
  message: string;
  /** Called after the user confirms. Must both end the session and navigate. */
  onConfirmLeave: () => void;
}) {
  useEffect(() => {
    if (!active) return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      AppAlert.alert(title, message, [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: onConfirmLeave },
      ]);
      // true = handled. Without this the navigator pops underneath the dialog and the
      // user ends up one screen back with a "leave?" prompt on top of it.
      return true;
    });

    return () => subscription.remove();
  }, [active, title, message, onConfirmLeave]);
}
