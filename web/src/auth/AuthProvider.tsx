import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { login as apiLogin, logout as apiLogout, register as apiRegister, fetchMe, ApiError, type AuthUser } from "@sarkaritaiyaari/core/api";
import { AuthContext, type AuthContextValue } from "./AuthContext";

/**
 * Web's session.
 *
 * The backend issues an opaque bearer token (not a JWT — nothing here can or should decode it)
 * with a long TTL, and every authenticated call passes it explicitly. Two consequences shape
 * this file:
 *
 * - The token lives in localStorage, the same trust level `admin/` already uses. That is a
 *   real, accepted trade rather than an oversight: the backend is header-only and sets no
 *   cookies, so there is no httpOnly option, and an XSS on this origin could read the token.
 *   Recorded in the task doc so it stays a decision.
 * - A stored token may have been revoked since it was written, and only the server knows. So
 *   this validates with `fetchMe` on startup rather than trusting what it finds — the same
 *   call `admin/`'s AuthContext makes, for the same reason. Mobile can skip it because it
 *   stores an `expiresAt` alongside the token; here a revoked-but-unexpired token would
 *   otherwise look valid until the first real request failed.
 */

const TOKEN_KEY = "st_web_token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // A session that cannot be persisted still works for this tab.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Initialised from whether there is anything to validate, rather than set inside the effect:
  // with no stored token there is nothing to wait for, and setting state synchronously in an
  // effect triggers a second render for no reason.
  const [initialising, setInitialising] = useState(() => readToken() !== null);

  useEffect(() => {
    const stored = readToken();
    if (!stored) return;

    let cancelled = false;
    fetchMe(stored)
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 401 means revoked or expired — drop it. Anything else (offline, backend down) is not
        // evidence the token is bad, so keep it and let the next real request decide.
        if (err instanceof ApiError && err.status === 401) {
          writeToken(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback((result: { token: string; user: AuthUser }) => {
    writeToken(result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      adopt(await apiLogin(email, password));
    },
    [adopt],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      adopt(await apiRegister(email, password, displayName));
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    const current = readToken();
    // Clear locally regardless of whether the server call succeeds — a failed revoke must not
    // leave someone stuck signed in on a shared computer.
    writeToken(null);
    setToken(null);
    setUser(null);
    if (current) {
      await apiLogout(current).catch(() => {});
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, initialising, signIn, signUp, signOut }),
    [user, token, initialising, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
