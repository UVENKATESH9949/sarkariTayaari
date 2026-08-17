# Architecture Decision Records

The real "why we built it this way" record for this project. Each entry is a decision that was actually made and implemented — not a proposal. Add a new `ADR-xxx` here whenever a real architectural choice gets made with a real alternative that was rejected; don't record routine implementation details.

---

### ADR-001 — Opaque, revocable tokens instead of JWT
- **Status:** Confirmed (implemented)
- **Context:** Needed a mobile auth token that survives a 365-day TTL and can be revoked server-side (e.g. on sign-out) without a blocklist.
- **Decision:** Store a random opaque token server-side (`user_tokens`), looked up per request; not a self-contained JWT.
- **Alternatives:** JWT with short expiry + refresh tokens.
- **Reason:** A revoked JWT is still valid until it expires unless a blocklist is maintained anyway — at which point you've reinvented an opaque-token lookup with extra steps, for a single-backend system with no need for stateless verification across services.
- **Consequences:** Every authenticated request costs one DB lookup (with a join-fetch to avoid a lazy-loading trap, itself a bug found and fixed). Fine at current scale; would need caching at real scale.

### ADR-002 — Modular monolith, not microservices
- **Status:** Confirmed (implemented, implicitly — never split)
- **Context:** One backend, one database, no production traffic yet.
- **Decision:** Single Spring Boot application with clear package-level module boundaries.
- **Alternatives:** Microservices per domain (auth, content, sync, progress).
- **Reason:** Microservices buy independent scaling/deployment at the cost of network calls, distributed transactions, and multiple things to operate — costs that are pure overhead with zero current benefit at this scale.
- **Consequences:** Easy to reason about and deploy today; a future split (if ever needed) would follow the existing package boundaries fairly cleanly, since they're already domain-shaped.

### ADR-003 — `spring-security-crypto` only, not `spring-boot-starter-security`
- **Status:** Confirmed (implemented)
- **Context:** Needed BCrypt hashing without adopting Spring Security's full filter chain.
- **Decision:** Depend on the crypto library alone; hand-roll a `requireUser(header)` check per endpoint that needs it.
- **Reason:** The full starter secures every endpoint by default, which would have broken existing public content endpoints and the sync flow without substantial reconfiguration, for a project with genuinely simple auth needs (one role, no OAuth, no scopes).
- **Consequences:** No automatic CSRF/session handling (not needed — stateless bearer tokens); auth checks are opt-in per controller method, which puts the burden of remembering to call `requireUser()` on every future endpoint author.

### ADR-004 — Two independent subject mappings (`exam_subjects` vs `section_subjects`)
- **Status:** Confirmed (implemented)
- **Context:** "Which subjects does this exam cover" (syllabus) and "which subjects does this specific paper's section draw from" (mock-test generation) are related but genuinely different facts.
- **Decision:** Keep them as separate tables; auto-add a section's subjects to the syllabus on save, so they can't casually diverge, but allow the syllabus to be broader (e.g. covers a subject with no paper pattern defined yet).
- **Alternatives:** Derive the syllabus purely from sections.
- **Reason:** Deriving it from sections meant an exam with no structure yet had *no syllabus at all*, which is wrong — "not modeled yet" and "covers nothing" are different facts.
- **Consequences:** Two tables to keep mentally straight; mitigated by the auto-sync-on-save behavior and by naming them for their actual purpose rather than generically.

### ADR-005 — Synthetic string PK for `user_bookmarks`, not a JPA composite `@IdClass`
- **Status:** Confirmed (implemented, after reverting a failed first attempt)
- **Context:** A bookmark is naturally keyed by `(user, question)`.
- **Decision:** Use a derived string id (`userId + ":" + questionId`) as a plain single-column primary key, matching the existing convention already used for `user_practice_session_results` (`sessionId + ":" + orderIndex`).
- **Alternatives tried and rejected:** `@IdClass` composite key with the `@ManyToOne` association as part of the identifier — this is textbook-valid JPA, but caused real 500 errors in integration testing (`isNew()` entity-state detection misbehaving for a derived composite identifier).
- **Reason:** The simpler, already-proven convention avoided a genuinely tricky corner of JPA entirely, rather than debugging it further.
- **Consequences:** One extra string-concatenation step in the service layer; in exchange, zero exposure to composite-key edge cases.

### ADR-006 — Debug-signed APKs served over plain HTTP download, not a store listing
- **Status:** Confirmed (implemented), explicitly **not production-final**
- **Context:** Needed a way to get a build onto a real device without the friction of transferring an APK file by hand.
- **Decision:** Backend serves a `/downloads` folder directly; Jenkins drops a built APK there.
- **Alternatives:** Google Play internal testing track, Firebase App Distribution.
- **Reason:** Fastest path to "click a link, install a build," while the product is pre-launch and iterating quickly.
- **Consequences:** No code signing for production trust, no automatic update mechanism, no crash-symbolication pipeline. **Must be replaced** before any real user distribution — tracked in `reports/open-questions.md`, not silently accepted as final.

### ADR-007 — expo-sqlite + Drizzle ORM, reversing an earlier WatermelonDB decision
- **Status:** Confirmed (implemented) — source: `offline-exam-app-requirements.md` §4
- **Context:** Needed a local mobile database for the offline-first content cache.
- **Decision:** WatermelonDB was the *first* decision made, then explicitly reversed to expo-sqlite + Drizzle ORM during Sprint 2 (TICKET-202).
- **Reason (verbatim rationale):** WatermelonDB requires a custom native build, leaving Expo Go entirely; expo-sqlite + Drizzle stays inside Expo Go with no native build step, and has first-class documented Expo support.
- **Consequences:** Faster iteration during early development (no native rebuild per change); this same choice is exactly why a debug **dev-client** build (not Expo Go) later became necessary once `@react-native-community/netinfo` was added for the offline indicator — a reminder that "stays in Expo Go" is a moving target as native dependencies accumulate, not a permanent guarantee.

### ADR-008 — Mock tests generated on-the-fly, not curated fixed sets
- **Status:** Confirmed (implemented) — source: `offline-exam-app-requirements.md` §6
- **Context:** Needed to decide how a mock test's question set is assembled.
- **Decision:** Each attempt is assembled at start-time from the locally-synced pool, per-subject counts matching a blueprint, rather than admin-authored fixed papers.
- **Alternatives:** Curated fixed test sets (same paper every time, comparable across attempts and users).
- **Reason:** Zero new content-authoring burden; works immediately against whatever's already synced.
- **Consequences (explicitly accepted trade-off):** attempts may repeat questions at the current small question-bank size, and two attempts aren't a fixed, comparable paper — no percentile/rank comparison is possible under this model. The source document explicitly flags revisiting curated fixed sets once question volume is much higher.
