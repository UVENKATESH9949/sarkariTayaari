import { apiFetch } from "./client";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type AuthResult = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export function register(email: string, password: string, displayName?: string, deviceLabel?: string) {
  return apiFetch<AuthResult>("/auth/register", {
    method: "POST",
    body: { email, password, displayName, deviceLabel },
  });
}

export function login(email: string, password: string, deviceLabel?: string) {
  return apiFetch<AuthResult>("/auth/login", {
    method: "POST",
    body: { email, password, deviceLabel },
  });
}

/** Revokes this device's token only; other devices stay signed in. */
export function logout(token: string) {
  return apiFetch<void>("/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Used on launch to check a stored token is still valid. */
export function fetchMe(token: string) {
  return apiFetch<AuthUser>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
