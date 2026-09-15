import { createContext, useContext } from "react";
import type { AuthUser } from "@sarkaritaiyaari/core/api";

/** Split from the provider so Fast Refresh keeps working — see the note in ThemeContext.ts. */

export type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  /** True until a stored token has been validated, so the UI need not flash a signed-out shell. */
  initialising: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  initialising: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
