import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";

/** What the toast should currently be showing, or null for nothing. */
export type NetworkTransition = "offline" | "online";

type NetworkStatusValue = {
  /**
   * null until the first NetInfo event arrives (usually within a frame). Treated as
   * online everywhere it's read, because assuming offline on a fresh launch would flash
   * an offline banner on every cold start before the first event lands.
   */
  isOnline: boolean | null;
  /**
   * Set only on an actual change of connectivity, and cleared on a timer. This is what
   * the toast renders — see the note below on why it is not derived from `isOnline`.
   */
  transition: NetworkTransition | null;
  /** Dismisses the current toast early (the toast itself calls this if tapped). */
  dismissTransition: () => void;
};

const NetworkStatusContext = createContext<NetworkStatusValue>({
  isOnline: null,
  transition: null,
  dismissTransition: () => {},
});

export function useNetworkStatus() {
  return useContext(NetworkStatusContext);
}

/** How long a toast stays up. Doc 2 §1 asks for 3-4 seconds. */
const TOAST_MS = 3500;

/**
 * This app is offline-first by design — nothing here should ever block on
 * connectivity. What was missing was telling the user *why* an action that
 * does need the network (signing in, checking for new content) isn't
 * working, instead of it silently failing or surfacing a raw fetch error.
 *
 * `isConnected` alone is true on a Wi-Fi network with no internet (e.g. a
 * captive portal), so this also requires `isInternetReachable` when NetInfo
 * has an opinion about it — `null` means it hasn't decided yet, which is
 * common right after a network change, so that case is treated as online
 * rather than flapping the banner on every transition.
 *
 * ## Why `transition` is separate state rather than derived from `isOnline`
 *
 * The banner this replaced rendered on `isOnline === false`, so it stayed on screen for
 * as long as the device was offline — which on a train is the entire session. Making it
 * temporary is not a matter of adding a timer to that component: a component that renders
 * from a *level* has nothing to time. It has to be driven by the *edge*.
 *
 * So the provider compares each NetInfo reading against the last one it accepted and only
 * emits when they differ. That also gives the three edge cases their behaviour for free:
 *
 *  - A reading identical to the current state emits nothing, so re-renders and repeated
 *    NetInfo events while offline cannot re-trigger the toast.
 *  - The very first reading emits nothing, because there is no previous state to have
 *    changed from — a launch that is already offline is not an event that just happened.
 *    (It is still reflected in `isOnline`, which the screens use for their own empty
 *    states.)
 *  - Rapid flapping replaces the visible toast and restarts its timer rather than
 *    stacking, because there is only ever one `transition` value and one timer.
 *
 * Foreground/background is handled by clearing on background rather than by pausing: a
 * toast whose 3.5 seconds elapsed while the app was in the background should not be
 * waiting on screen when the user comes back, and connectivity may well have changed
 * again in the meantime.
 */
export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [transition, setTransition] = useState<NetworkTransition | null>(null);
  // The last reading acted on. A ref, not `isOnline`, because the NetInfo listener is
  // registered once and a closed-over state value there would be permanently stale.
  const lastKnownRef = useRef<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissTransition = useCallback(() => {
    clearTimer();
    setTransition(null);
  }, [clearTimer]);

  const show = useCallback(
    (next: NetworkTransition) => {
      clearTimer();
      setTransition(next);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setTransition(null);
      }, TOAST_MS);
    },
    [clearTimer],
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      setIsOnline(online);

      const previous = lastKnownRef.current;
      lastKnownRef.current = online;
      // First reading: record it, announce nothing. See the note above.
      if (previous === null) return;
      if (previous === online) return;
      show(online ? "online" : "offline");
    });

    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next !== "active") dismissTransition();
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
      clearTimer();
    };
  }, [show, dismissTransition, clearTimer]);

  return (
    <NetworkStatusContext.Provider value={{ isOnline, transition, dismissTransition }}>
      {children}
    </NetworkStatusContext.Provider>
  );
}
