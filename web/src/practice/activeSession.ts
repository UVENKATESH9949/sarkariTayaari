import { createContext, useContext } from "react";

/** Split from the provider so Fast Refresh keeps working — see the note in theme/ThemeContext.ts. */

export type ActiveSessionContextValue = {
  isActive: boolean;
  /** Call when a timed session starts (e.g. Mock Test's briefing screen's Start button). */
  start: () => void;
  /** Call when it ends, however it ends — submitted, auto-submitted, or abandoned after confirmation. */
  end: () => void;
};

export const ActiveSessionContext = createContext<ActiveSessionContextValue>({
  isActive: false,
  start: () => {},
  end: () => {},
});

export function useActiveSession() {
  return useContext(ActiveSessionContext);
}
