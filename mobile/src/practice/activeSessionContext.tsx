import { createContext, useCallback, useContext, useRef, useState, type MutableRefObject, type ReactNode } from "react";

type SessionKind = "practice" | "mock" | null;
/** The 5 top-level tab routes — the only valid tab-switch destinations. */
export type TabHref = "/" | "/practice" | "/mock-test" | "/exams" | "/progress" | "/more";

type ActiveSessionContextValue = {
  activeSession: SessionKind;
  /** Always current, unlike `activeSession` — read this from any callback that
   * might be captured once and reused (e.g. expo-router's `screenListeners`),
   * since a closed-over `activeSession` value there can go stale. */
  activeSessionRef: MutableRefObject<SessionKind>;
  beginSession: (kind: "practice" | "mock") => void;
  /** Session finished normally (quiz completed / test submitted) — navigation proceeds as usual. */
  endSession: () => void;
  /** Session was cut short (tab-switch Leave, or Exit-without-submitting) — the owning
   * screen resets its own stack back to its first route via resetSignal. */
  abandonSession: () => void;
  resetSignal: { practice: number; mock: number };
  /** Set by the tab bar right before abandonSession(), read (and cleared) by the
   * owning screen's own resetSignal effect once it's fixed up its own stack —
   * see the note on abandonSession below for why the tab bar can't just navigate
   * there directly itself. */
  pendingDestinationRef: MutableRefObject<TabHref | null>;
};

const ActiveSessionContext = createContext<ActiveSessionContextValue>({
  activeSession: null,
  activeSessionRef: { current: null },
  beginSession: () => {},
  endSession: () => {},
  abandonSession: () => {},
  resetSignal: { practice: 0, mock: 0 },
  pendingDestinationRef: { current: null },
});

export function useActiveSession() {
  return useContext(ActiveSessionContext);
}

/**
 * Tracks whether a Practice quiz or Mock Test is in progress, so the tab bar
 * can warn before a tab switch abandons it. Deliberately just a flag, not the
 * session data itself — the quiz/test screens own their own state, discarded
 * naturally when their nested stack remounts on abandonSession().
 *
 * beginSession/endSession/abandonSession are stable (empty deps) and read the
 * current session kind through a ref rather than a closed-over value —
 * expo-router's Tabs only evaluates `screenListeners` per route once, not on
 * every re-render, so a callback capturing `activeSession` directly would see
 * a stale snapshot from whenever that route's listener was first created.
 */
export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSessionState] = useState<SessionKind>(null);
  const [resetSignal, setResetSignal] = useState({ practice: 0, mock: 0 });
  const activeSessionRef = useRef<SessionKind>(null);
  const pendingDestinationRef = useRef<TabHref | null>(null);

  const setActiveSession = useCallback((kind: SessionKind) => {
    activeSessionRef.current = kind;
    setActiveSessionState(kind);
  }, []);

  const beginSession = useCallback((kind: "practice" | "mock") => setActiveSession(kind), [setActiveSession]);
  const endSession = useCallback(() => setActiveSession(null), [setActiveSession]);
  const abandonSession = useCallback(() => {
    const current = activeSessionRef.current;
    if (current) {
      setResetSignal((prev) => ({ ...prev, [current]: prev[current] + 1 }));
    }
    setActiveSession(null);
  }, [setActiveSession]);

  return (
    <ActiveSessionContext.Provider
      value={{
        activeSession,
        activeSessionRef,
        beginSession,
        endSession,
        abandonSession,
        resetSignal,
        pendingDestinationRef,
      }}
    >
      {children}
    </ActiveSessionContext.Provider>
  );
}
