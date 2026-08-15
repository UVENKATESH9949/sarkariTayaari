# TICKET-204 — Completed

**Sprint:** Sprint 2 — Mobile App Scaffold
**Scope:** Basic app shell — home screen, exam selection screen (static UI, no data yet).

## What was done

- **Home screen** (`mobile/src/app/index.tsx`): app name/tagline hero section, "Start Practice" button linking to the exam selection screen (`expo-router` `Link`), and a small "Works fully offline after first sync" note. Replaces the TICKET-202/203 scaffolding code (which just dumped local DB row counts as text — that check is done, no longer needed on screen).
- **Exam selection screen** (`mobile/src/app/exam-selection.tsx`): lists all 6 exam types (SSC CGL, SSC CHSL, IBPS PO, IBPS Clerk, RRB NTPC, RRB Group D). Only SSC CGL is enabled/tappable — matches the actual seeded data (TICKET-105, 100 SSC CGL questions); the rest are visibly disabled with a "Coming soon" badge, so the UI doesn't imply exams that have no content yet. Tapping the enabled card shows a selection highlight and an inline note ("Practice for SSC CGL will be available in a later update") since the practice flow itself is Sprint 4 — no dead-end navigation to a screen that doesn't exist yet.
- Updated `mobile/src/app/_layout.tsx` to set proper header titles per screen (`Stack.Screen options`) instead of the default route-name titles ("index", "exam-selection").
- Both screens are purely static per ticket scope — no SQLite queries, no API calls.

## Verification

Verified on the Android emulator via `adb shell screencap` (not just logs):
- Home screen renders with correct title/tagline/button after a full app reload (header title needed a cold reload — Fast Refresh alone didn't repaint `_layout.tsx`'s Stack options).
- Tapping "Start Practice" navigates to the exam selection screen, header shows "Select Exam" with a working back arrow.
- Confirmed exact tap coordinates via `adb shell uiautomator dump` rather than guessing from the screenshot, since the button's real bounds didn't match a visual coordinate estimate.
- Tapping SSC CGL shows the selected-state border/highlight plus the "available in a later update" note; the 5 disabled cards report `enabled="false"` in the UI dump and don't respond to taps.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 2, TICKET-204)
- Code: `../mobile/src/app/index.tsx`, `../mobile/src/app/exam-selection.tsx`, `../mobile/src/app/_layout.tsx`
