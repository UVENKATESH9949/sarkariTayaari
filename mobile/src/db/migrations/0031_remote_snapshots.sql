-- A generic store for "the last answer the server gave us", used to render a server-computed
-- screen instantly and to keep it usable offline.
--
-- ONE TABLE, NOT ONE PER FEATURE. The daily plan is the first caller, but the study roadmap,
-- the revision plan and the learning state are the same shape of problem — an expensive,
-- server-owned read with a device that has nowhere to put the result. A per-feature table each
-- would be three migrations and three near-identical read paths to drift apart.
--
-- `key` carries everything that makes a snapshot distinct, including the user id: signing in as
-- a different account must never surface the previous account's plan, and scoping by key is
-- safer than relying on a sign-out hook that could be missed. See `data/snapshotStore.ts`.
--
-- `payload` is the response JSON exactly as received. Deliberately not normalised into typed
-- columns: this is a cache of someone else's contract, and a schema here would have to be
-- migrated every time that contract gains a field.
--
-- Guarded CREATE so a re-run is harmless. SQLite has no ADD COLUMN IF NOT EXISTS, but a whole
-- new table can be created safely — and a failed local migration is a hard gate that stops the
-- app starting, so nothing here may be unguardable.
CREATE TABLE IF NOT EXISTS `remote_snapshots` (
    `key` text PRIMARY KEY NOT NULL,
    `payload` text NOT NULL,
    `fetched_at` integer NOT NULL
);
