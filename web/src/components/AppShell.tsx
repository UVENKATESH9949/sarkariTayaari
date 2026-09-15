import { useNavigate, type To } from "react-router-dom";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useAuth } from "../auth/AuthContext";
import { useActiveSession } from "../practice/activeSession";
import { BrandMark, HomeIcon, BookIcon, TimerIcon, CapIcon, ChartIcon, UserIcon, GearIcon } from "./icons";
import { ConfirmDialog } from "./ConfirmDialog";
import { GuardedNavLink } from "./GuardedNavLink";
import { Footer } from "./Footer";

/**
 * The responsive shell: a sidebar from 1024px up, a bottom bar below it.
 *
 * This is where the web app deliberately stops mirroring the phone. Mobile has five tabs plus
 * a "More" screen acting as an overflow menu for Account, Settings, My Exams and Progress — an
 * overflow that exists because a phone tab bar runs out of room. A sidebar does not, so More
 * dissolves into the navigation rather than being ported as a screen.
 *
 * Progress is a real destination here for the same reason. On mobile it is registered with
 * `href: null` and reachable only from a Home card, a deliberate choice made when the tab bar
 * was overcrowded.
 *
 * Every nav link is guarded: while a Mock Test attempt is active (`useActiveSession`), clicking
 * away shows a confirmation instead of navigating immediately — the same problem mobile solved
 * by intercepting a tab-bar press, here intercepted at the click itself. See
 * `practice/ActiveSessionProvider.tsx`'s own comment for why this isn't a router-level blocker.
 */

type NavItem = { to: To; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: HomeIcon, end: true },
  { to: "/practice", label: "Practice", icon: BookIcon },
  { to: "/mock-test", label: "Mock Test", icon: TimerIcon },
  { to: "/exams", label: "Exams", icon: CapIcon },
  { to: "/progress", label: "Progress", icon: ChartIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, initialising } = useAuth();
  const { end: endSession } = useActiveSession();
  const navigate = useNavigate();
  const accountLabel = initialising ? "Account" : user ? (user.displayName ?? user.email) : "Sign in";
  const [pendingTo, setPendingTo] = useState<To | null>(null);

  function requestLeave(to: To) {
    setPendingTo(to);
  }

  function confirmLeave() {
    if (pendingTo) {
      endSession();
      navigate(pendingTo);
    }
    setPendingTo(null);
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>

      {/*
        Narrow screens only. The bottom bar holds the five primary destinations and has no room
        for Account and Settings, which live in the sidebar's footer at desktop width — without
        this they would be completely unreachable on a phone. This is the same pressure that
        made the native app invent a "More" tab; a top bar costs less than a whole extra screen.
      */}
      <header className="topbar">
        <span className="brand">
          <BrandMark className="brand-mark" aria-hidden="true" />
          <span className="brand-word">SarkariTaiyaari</span>
        </span>
        <div className="topbar-actions">
          <GuardedNavLink to="/account" className="topbar-action" onGuardedClick={requestLeave}>
            <UserIcon aria-hidden="true" />
          </GuardedNavLink>
          <GuardedNavLink to="/settings" className="topbar-action" onGuardedClick={requestLeave}>
            <GearIcon aria-hidden="true" />
          </GuardedNavLink>
        </div>
      </header>

      <nav className="nav" aria-label="Primary">
        <div className="nav-brand">
          <span className="brand">
            <BrandMark className="brand-mark" aria-hidden="true" />
            <span className="brand-word">SarkariTaiyaari</span>
          </span>
        </div>

        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <GuardedNavLink key={String(to)} to={to} end={end} className="nav-link" onGuardedClick={requestLeave}>
            <span className="nav-icon" aria-hidden="true"><Icon /></span>
            <span>{label}</span>
          </GuardedNavLink>
        ))}

        <div className="nav-account">
          <GuardedNavLink to="/account" className="nav-link" onGuardedClick={requestLeave}>
            <span className="nav-icon" aria-hidden="true"><UserIcon /></span>
            <span>{accountLabel}</span>
          </GuardedNavLink>
          <GuardedNavLink to="/settings" className="nav-link" onGuardedClick={requestLeave}>
            <span className="nav-icon" aria-hidden="true"><GearIcon /></span>
            <span>Settings</span>
          </GuardedNavLink>
        </div>
      </nav>

      <main id="main" className="shell-main">
        {children}
        <Footer onGuardedClick={requestLeave} />
      </main>

      <ConfirmDialog
        open={pendingTo !== null}
        title="Leave this test?"
        message="Your progress on this attempt will be lost if you leave now."
        confirmLabel="Leave"
        onConfirm={confirmLeave}
        onCancel={() => setPendingTo(null)}
      />
    </div>
  );
}
