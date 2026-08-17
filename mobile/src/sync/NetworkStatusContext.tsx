import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import NetInfo from "@react-native-community/netinfo";

type NetworkStatusValue = {
  /**
   * null until the first NetInfo event arrives (usually within a frame). Treated as
   * online everywhere it's read, because assuming offline on a fresh launch would flash
   * an offline banner on every cold start before the first event lands.
   */
  isOnline: boolean | null;
};

const NetworkStatusContext = createContext<NetworkStatusValue>({ isOnline: null });

export function useNetworkStatus() {
  return useContext(NetworkStatusContext);
}

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
 */
export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  }, []);

  return <NetworkStatusContext.Provider value={{ isOnline }}>{children}</NetworkStatusContext.Provider>;
}
