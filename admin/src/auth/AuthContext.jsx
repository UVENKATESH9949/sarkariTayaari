import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { login as loginRequest, logoutRequest, getMe, setAuthToken, setOnUnauthorized } from "../api.js";

const STORAGE_KEY = "st_admin_token";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOutLocally = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(signOutLocally);
  }, [signOutLocally]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    setAuthToken(stored);
    // Never trust a cached user — re-fetch so a revoked/expired token is caught immediately.
    getMe()
      .then(setUser)
      .catch(() => signOutLocally())
      .finally(() => setLoading(false));
  }, [signOutLocally]);

  async function login(email, password) {
    const auth = await loginRequest(email, password);
    localStorage.setItem(STORAGE_KEY, auth.token);
    setAuthToken(auth.token);
    setUser(auth.user);
  }

  async function logout() {
    try {
      await logoutRequest();
    } catch {
      // Best-effort: the local session clears regardless of whether the server call succeeds.
    }
    signOutLocally();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
