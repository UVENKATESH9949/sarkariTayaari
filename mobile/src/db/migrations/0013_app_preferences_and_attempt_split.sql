--> HAND-EDITED, same convention as 0011 and 0012: the CREATE carries IF NOT EXISTS, which
--> drizzle-kit does not generate. A failed migration is a hard gate in app/_layout.tsx —
--> the app renders "Database migration failed" and cannot start at all — so table DDL is
--> guarded wherever SQLite allows it.
-->
--> KNOWN GAP, unchanged from 0012 and stated rather than hidden: SQLite has no
--> `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so the single ADD COLUMN at the bottom
--> cannot be guarded. It is last on purpose, so the guarded CREATE above it has already
--> committed. With only one such statement here there is no partial-failure window
--> *within* this file: either the column is added and the migration is marked applied, or
--> it is not and the retry re-runs an idempotent CREATE followed by the same ADD COLUMN.

--> Doc 2 §10/§11/§13 — device-local UI preferences (theme, zoom, interface language).
--> Not synced and not cleared on sign-out: these describe the phone and its reader, not
--> the account. See the note on appPreferences in db/schema.ts.
CREATE TABLE IF NOT EXISTS `app_preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`theme_mode` text,
	`zoom_level` real,
	`ui_language` text
);
--> statement-breakpoint

--> Doc 2 §7/§8 — splitting "questions answered" from "questions offered".
-->
--> `total_count` has always meant both at once, which was only correct because finishing a
--> practice set required answering every question in it. §7 removes that requirement, so
--> the two have to be separate columns: `total_count` keeps its existing meaning of
--> ANSWERED (it is the denominator of every accuracy figure in the app, in eight read
--> sites plus the sync payload plus the backend entity) and this new column records what
--> the set offered, for display only.
-->
--> Nullable on purpose. Every session recorded before today has total_count == offered by
--> construction, but backfilling that as a real value would assert something about those
--> sessions that this migration cannot know for future ones, and NULL already renders as
--> "no separate figure to show". Nothing divides by it.
ALTER TABLE `practice_sessions` ADD COLUMN `available_count` integer;
