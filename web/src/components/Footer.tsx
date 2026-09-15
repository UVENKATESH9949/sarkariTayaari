import type { MouseEvent } from "react";
import type { To } from "react-router-dom";
import { BrandMark } from "./icons";
import { GuardedNavLink } from "./GuardedNavLink";

/**
 * Compact on a phone (just the brand line + copyright, above the fixed bottom nav's
 * reserved padding on `.shell-main`); a full multi-column treatment once the shell has
 * switched to a sidebar at 64rem — see `.footer` in `styles/index.css`.
 *
 * Every link points at a route that actually exists in `App.tsx`. No Legal/Support/Privacy
 * section — this product has no such pages yet, and inventing links to pages that don't
 * exist would be exactly the "fake functionality" this redesign was told not to add.
 *
 * Links reuse `GuardedNavLink` so leaving an active Mock Test attempt from the footer asks
 * for confirmation the same way the sidebar/bottom-bar nav already does.
 */
const PRODUCT_LINKS: { to: To; label: string }[] = [
  { to: "/", label: "Home" },
  { to: "/practice", label: "Practice" },
  { to: "/mock-test", label: "Mock Test" },
  { to: "/exams", label: "Exams" },
  { to: "/progress", label: "Progress" },
];

const ACCOUNT_LINKS: { to: To; label: string }[] = [
  { to: "/account", label: "Account" },
  { to: "/settings", label: "Settings" },
];

export function Footer({ onGuardedClick }: { onGuardedClick: (to: To, event: MouseEvent) => void }) {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-columns">
        <div>
          <span className="brand">
            <BrandMark className="brand-mark" aria-hidden="true" />
            <span className="brand-word">SarkariTaiyaari</span>
          </span>
          <p className="footer-brand-blurb">
            Practice questions, full-length mock tests and preparation tracking for
            government exam aspirants.
          </p>
        </div>

        <div>
          <div className="footer-heading">Product</div>
          <nav className="footer-links" aria-label="Footer navigation">
            {PRODUCT_LINKS.map(({ to, label }) => (
              <GuardedNavLink key={String(to)} to={to} className="footer-link" onGuardedClick={onGuardedClick}>
                {label}
              </GuardedNavLink>
            ))}
          </nav>
        </div>

        <div>
          <div className="footer-heading">Account</div>
          <nav className="footer-links" aria-label="Footer account navigation">
            {ACCOUNT_LINKS.map(({ to, label }) => (
              <GuardedNavLink key={String(to)} to={to} className="footer-link" onGuardedClick={onGuardedClick}>
                {label}
              </GuardedNavLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="footer-bottom">
        {/* Only shown on a phone, where `.footer-columns` (which already carries the brand
            mark) is hidden — showing it here too on desktop would duplicate it. */}
        <span className="brand footer-bottom-brand">
          <BrandMark className="brand-mark" aria-hidden="true" />
          <span className="brand-word">SarkariTaiyaari</span>
        </span>
        <span>© {year} SarkariTaiyaari</span>
      </div>
    </footer>
  );
}
