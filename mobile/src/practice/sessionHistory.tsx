import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./authContext";
import type { ReactNode } from "react";
import {
  clearAllSessions,
  insertSession,
  loadSessions,
  type QuestionResult,
  type SessionRecord,
} from "../db/practiceSessions";

export type { QuestionResult, SessionRecord };

const MAX_SESSIONS = 50;

type SessionHistoryContextValue = {
  sessions: SessionRecord[];
  addSession: (session: SessionRecord) => void;
  getSession: (id: string) => SessionRecord | undefined;
  clearSessions: () => void;
};

const SessionHistoryContext = createContext<SessionHistoryContextValue>({
  sessions: [],
  addSession: () => {},
  getSession: () => undefined,
  clearSessions: () => {},
});

export function useSessionHistory() {
  return useContext(SessionHistoryContext);
}

/**
 * Backed by local SQLite (`practice_sessions`/`practice_session_results`), so
 * history survives app restarts. Reads/writes are async, but the context API
 * stays synchronous: state updates optimistically first (so screens that
 * call addSession() and immediately navigate — Quiz → Summary — see the new
 * session right away), and the SQLite write happens in the background.
 */
export function SessionHistoryProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  // Signing in restores history into SQLite after this provider has already loaded.
  // Without re-reading, a student signs in on a new phone and still sees nothing.
  const { progressVersion } = useAuth();

  useEffect(() => {
    loadSessions().then(setSessions);
  }, [progressVersion]);

  const addSession = (session: SessionRecord) => {
    setSessions((prev) => [session, ...prev].slice(0, MAX_SESSIONS));
    insertSession(session).catch((err) => console.warn("Failed to persist session", err));
  };

  const getSession = (id: string) => sessions.find((s) => s.id === id);

  const clearSessions = () => {
    setSessions([]);
    clearAllSessions().catch((err) => console.warn("Failed to clear sessions", err));
  };

  return (
    <SessionHistoryContext.Provider value={{ sessions, addSession, getSession, clearSessions }}>
      {children}
    </SessionHistoryContext.Provider>
  );
}
