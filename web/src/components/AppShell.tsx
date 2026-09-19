import { useNavigate, type To } from "react-router-dom";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useAuth } from "../auth/AuthContext";
import { useActiveSession } from "../practice/activeSession";
import {
  BrandMark,
  HomeIcon,
  BookIcon,
  TimerIcon,
  CapIcon,
  ChartIcon,
  UserIcon,
  GearIcon,
  MenuIcon,
  CloseIcon,
} from "./icons";
import { ConfirmDialog } from "./ConfirmDialog";
import { GuardedNavLink } from "./GuardedNavLink";
import { Footer } from "./Footer";

/**
 * The app shell: one top navigation bar at every width, replacing the earlier sidebar
 * (desktop) / bottom-tab-bar (phone) pair — by explicit direction, the whole app moved onto
 * a single navigation idiom rather than keep two different ones depending on width.
 *
 * Below 1024px the primary links collapse into a menu button instead of showing inline.
 * This is a real, disclosed trade-off, not an oversight: a phone-width layout no longer has
 * an always-visible, thumb-reach bottom bar the way it did before this change — reaching
 * Practice or Mock Test on a phone now takes opening the menu first.
 *
 * Every nav link is guarded: while a Mock Test attempt is active (`useActiveSession`),
 * clicking away shows a confirmation instead of navigating immediately.
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
  const [menuOpen, setMenuOpen] = useState(false);

  function requestLeave(to: To) {
    setMenuOpen(false);
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

      <header className="topnav">
        <div className="topnav-inner">
          <span className="brand">
            <BrandMark className="brand-mark" aria-hidden="true" />
            <span className="brand-word">SarkariTaiyaari</span>
          </span>

          <nav className="topnav-links" aria-label="Primary">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <GuardedNavLink key={String(to)} to={to} end={end} className="topnav-link" onGuardedClick={requestLeave}>
                {label}
              </GuardedNavLink>
            ))}
          </nav>

          <div className="topnav-actions">
            <GuardedNavLink to="/settings" className="topnav-icon-btn" onGuardedClick={requestLeave} aria-label="Settings">
              <GearIcon aria-hidden="true" />
            </GuardedNavLink>
            <GuardedNavLink to="/account" className="btn topnav-account" onGuardedClick={requestLeave}>
              {accountLabel}
            </GuardedNavLink>
            <button
              type="button"
              className="topnav-icon-btn topnav-menu-btn"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <CloseIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="topnav-menu" role="menu">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <GuardedNavLink key={String(to)} to={to} end={end} className="topnav-menu-link" onGuardedClick={requestLeave}>
                <span className="topnav-menu-icon" aria-hidden="true"><Icon /></span>
                <span>{label}</span>
              </GuardedNavLink>
            ))}
            <div className="topnav-menu-divider" />
            <GuardedNavLink to="/account" className="topnav-menu-link" onGuardedClick={requestLeave}>
              <span className="topnav-menu-icon" aria-hidden="true"><UserIcon /></span>
              <span>{accountLabel}</span>
            </GuardedNavLink>
          </div>
        )}
      </header>

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
