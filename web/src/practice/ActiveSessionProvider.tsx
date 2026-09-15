import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActiveSessionContext } from "./activeSession";

/**
 * Tracks whether an active, unsubmitted timed session (currently: a Mock Test attempt) is in
 * progress, so navigating away can be guarded — the same problem mobile solved with
 * `practice/activeSessionContext.tsx` intercepting a tab-bar press, ported to the two
 * mechanisms a browser actually offers:
 *
 * - **In-app navigation** (clicking a sidebar/nav link, or any other in-app link) is
 *   intercepted by `AppShell`, which checks `isActive` before navigating and shows a styled
 *   confirmation dialog instead of a native `window.confirm` — consistent with the rest of
 *   this app's design system rather than a jarring browser-native popup.
 * - **Tab close / refresh / typing a new URL** cannot be intercepted the same way — the
 *   `beforeunload` event is the only mechanism a browser exposes for this, and it can only
 *   trigger the browser's OWN native "leave site?" prompt, with no custom text or styling.
 *   This provider registers that listener automatically whenever a session is active.
 *
 * Deliberately not built as a React Router data-router `useBlocker` (which would need
 * migrating this whole app off plain `<BrowserRouter>` just for this one guard) — intercepting
 * at the navigation TRIGGER, same as mobile's own tab-press interception, is both simpler and
 * a closer port of the pattern that already shipped and was already proven there.
 */
export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  // A ref mirrors the state so the beforeunload listener (registered once, not re-bound on
  // every start/end) always reads the current value rather than a stale closure.
  const isActiveRef = useRef(false);

  const start = useCallback(() => {
    isActiveRef.current = true;
    setIsActive(true);
  }, []);

  const end = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isActiveRef.current) return;
      // Both lines are required for cross-browser support of the native prompt; neither
      // shows custom text — browsers have refused to render a custom message here for years,
      // specifically so a site cannot phish a misleading "are you sure" dialog.
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return <ActiveSessionContext.Provider value={{ isActive, start, end }}>{children}</ActiveSessionContext.Provider>;
}
