import { NavLink, type To } from "react-router-dom";
import type { MouseEvent, ReactNode } from "react";
import { useActiveSession } from "../practice/activeSession";

/**
 * A `NavLink` that asks before leaving an active Mock Test attempt instead of navigating
 * immediately — shared by `AppShell`'s sidebar/bottom-bar links and `Footer`'s links, so
 * every navigation surface in the shell guards the same way. See `AppShell.tsx`'s own
 * comment for why this is intercepted at the click rather than at the router level.
 */
export function GuardedNavLink({
  to,
  end,
  className,
  children,
  onGuardedClick,
}: {
  to: To;
  end?: boolean;
  className: string;
  children: ReactNode;
  /** Called instead of navigating, when a session is active — should ask and then navigate itself if confirmed. */
  onGuardedClick: (to: To, event: MouseEvent) => void;
}) {
  const { isActive } = useActiveSession();
  return (
    <NavLink
      to={to}
      end={end}
      className={className}
      onClick={(e) => {
        if (isActive) {
          e.preventDefault();
          onGuardedClick(to, e);
        }
      }}
    >
      {children}
    </NavLink>
  );
}
