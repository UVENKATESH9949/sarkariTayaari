# Web app: Home hero/rows redesign + app-wide top navigation

**Session date:** 2026-09-18. **Continuation of** `web-premium-redesign.md` in this same
directory (that pass covered loading states, breadcrumbs, and desktop side panels; this one
replaces Home's content and the app's navigation model).

## Requested

The user supplied two references in succession:
1. A saved Claude.ai chat page whose *outer chrome* was captured but whose actual artifact
   iframe content wasn't — the design intent had to be reconstructed from the assistant's
   own descriptive messages inside that transcript (Hotstar-style hero + horizontal
   category rows of exam tiles, color-coded, real photos where available).
2. A direct screenshot of a refined version of that same concept: a top navigation bar
   (not the sidebar shipped in the prior pass), a serif display headline, "spotlight" cards
   with a glow + ghost-text watermark and a corner exam-code badge, and row headers with a
   real count.

Before building anything, I asked one clarifying question per this project's own risk
process: whether the top nav should replace the sidebar everywhere, or apply to Home only.
**User's answer: everywhere.** That decision, not something I inferred, is why every route
in the app now shares one navigation model.

## What shipped

**App shell (`AppShell.tsx`, `GuardedNavLink.tsx`, `styles/index.css`)** — the sidebar
(≥1024px) / bottom-tab-bar (<1024px) pair from the prior session is gone, replaced by one
sticky top nav bar at every width:
- **≥1024px**: brand, five inline links (Home/Practice/Mock Test/Exams/Progress, active
  one underlined), a Settings gear icon, and a Sign-in/account-name button.
- **<1024px**: brand, the same Settings icon, and a menu button that opens a dropdown
  containing the five links plus Account — replacing the earlier compact-top-bar +
  bottom-tab-bar combination.
- `GuardedNavLink` was extended to accept pass-through props (`aria-label`, etc.) so the
  icon-only Settings link keeps an accessible name.

**A real, disclosed trade-off, not an oversight**: a phone no longer has an always-visible,
thumb-reach primary nav — reaching Practice or Mock Test from a phone now takes opening the
menu first. Documented in the shell's own comment and in the corrected QA requirements
(REQ-WEB-003/004 — see below), not hidden.

**Home (`pages/Home.tsx`, `pages/homeCategories.ts`, `components/ExamSpotlightCard.tsx`)**
— replaced the earlier flat exam grid (and the previous session's own poster-card rows)
with:
- **A hero**: eyebrow (real admin badge label + derived category, e.g. "Popular · SSC"),
  a large serif headline (the featured exam's real name, or generic welcome copy if no
  exam carries a badge), descriptive subtitle, and two CTAs — "Start free mock test"
  (routes to that exam's real mock-paper list) and "View syllabus" (routes to that exam's
  real Subjects screen — an honest label, since Subjects→Topics genuinely *is* this app's
  syllabus view). Deliberately dropped the vacancy/deadline facts line and the cycle-name
  subtitle from the previous pass — the reference didn't show them, and dropping them also
  removes the one real bug that pass had (a duplicated "(Demo) (Demo)" label).
- **Category rows**, unchanged in concept from the prior pass (Popular/SSC/Banking &
  Insurance/Railways/UPSC & Civil Services), now rendering `ExamSpotlightCard` tiles: a
  real uploaded exam photo (full-bleed, with a bottom gradient so the name stays legible)
  where one exists, or an abstract glow + a watermark derived from the exam's own code
  (`SSC_CGL` → `CGL`, never invented text) where it doesn't. A corner pill shows the real
  exam code, colored by the row's category.
- Row headings now show a real count ("4 exams") — accurate, not decorative.

**A deliberate, documented exception to the theme system**: the hero and every spotlight
card are fixed-dark regardless of the site's light/dark toggle — the same "always dark"
exception the shared design system already makes for hero/gradient cards elsewhere (mobile's
`Card variant="gradient"`), because the glow effect needs a dark canvas to read correctly.
The category glow color still comes from the real shared identity-color tokens (exported as
literal hex from `applyTheme.ts`'s `IDENTITY_DARK`, since a CSS `radial-gradient()` can't
blend a `var()` reference with an alpha suffix) — not a new, invented palette.

**One display font added, narrowly**: Fraunces (Google Fonts, same CDN precedent as the
existing Inter link), used only for the hero headline and card watermark via a new
`--font-display` token — not a second body font, and not applied anywhere else.

**Nothing fabricated**: category is the real `category` field when an admin sets it (still
null on all 11 active exams — checked live, same finding as the prior session), falling
back to reading the real exam code's own prefix; the "Popular" row and hero both come from
the real admin-set `badge` field; the watermark text is a transform of the real exam code;
vacancy counts are real. No popularity/attempt-count metric was invented (the reference's
"Most attempted this month" language was deliberately not used — relabelled "Popular" to
match what the data actually supports).

## A real investigation, not a bug

Screenshots showed a small icon overlapping the corner of the SSC CGL photo card. Verified
directly rather than assumed: `img.complete === true`, `naturalWidth/Height: 400×400` (the
photo loaded correctly), and `document.elementFromPoint()` at that exact pixel found only
the app's own `<img>`/badge elements — no extra DOM node exists there. The icon persisted
even with the mouse moved away before the screenshot. Conclusion: it's Chromium's own
native image-affordance overlay (unrelated to this app's markup or CSS), not a rendering
defect — nothing was "fixed" because there was nothing broken.

## Verified

- `tsc --noEmit`, `oxlint`, and `vite build` all clean.
- A live Playwright pass against the real backend (the same pre-existing dev instance from
  the prior session, still untouched) across 390/820/1440/1920px, both themes: Home's hero
  and all five category rows, the mobile hamburger menu opening/closing and its links, and
  Practice/Mock Test/Settings under the new shell (active-link underline, Settings icon
  highlighting, no leftover sidebar spacing). **Zero console errors at any point.**
- Confirmed the always-dark hero/cards look intentional (not like a rendering error) against
  both the dark and light site themes, since the surrounding chrome now differs while the
  hero/cards stay fixed.

## Documents updated

- `qa/requirements/web.yaml`: **REQ-WEB-003** and **REQ-WEB-004** corrected in place per
  `AI_RULES.md` §6 — both described the now-removed sidebar/bottom-bar model. Marked
  explicitly as stale-doc corrections rather than silently rewritten. New **REQ-WEB-014**
  is unchanged from the prior session's version except the hero's own description now
  matches what actually shipped (no facts line, no cycle-name subtitle).
- `qa/scenarios/web.yaml`, `qa/test-cases/web.yaml`: **SCN-WEB-004/005/017** and
  **TC-WEB-005/006/018** updated — same corrections, plus a note on each that they were
  re-verified reachable under the new model this session.
- `qa/traceability/RTM.md`, `qa/reports/dashboard.md` regenerated (counts unchanged —
  119/229/250 — since this was content correction, not new coverage).
- This report.

## Not verified

- No physical device, no real cross-browser pass (Chromium via Playwright only).
- The signed-in path was not exercised.
- `web/` has never been deployed — nothing was checked against a real deployed build.
- The menu-button dropdown's keyboard/focus-trap behaviour (Tab cycling, Escape to close)
  was not specifically audited — it inherits plain document flow and click-outside is not
  yet wired, so clicking elsewhere on the page while the menu is open does not close it
  (only a link click or re-toggling the button does). Worth a follow-up pass.
