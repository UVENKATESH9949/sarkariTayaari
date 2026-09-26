# Auth API

Covers `AuthController` (`/api/auth/*`) — registration, sign-in, sign-out, session check, and
admin account creation. This is the whole of the backend's auth surface: one opaque bearer
token per signed-in session, no JWT (see `reports/architecture-decisions.md` ADR-001), and a
`role` column (`STUDENT`/`ADMIN`) layered on the same token for admin access (ADR-009). For the
`users`/`user_tokens` table shapes, see `system-design/02-database.md`.

Every authenticated endpoint elsewhere in the backend takes the resolved token the same way:
an `Authorization: Bearer <token>` header, checked by `AuthService.requireUser`/`requireAdmin`
per endpoint — there is no servlet filter, so a controller that forgets the call is silently
public.

**Since 2026-09-21 there are two ways in.** A one-time code emailed to a Gmail address is what the
mobile app uses and is the first screen after installation; email + password is unchanged and still
serves the admin console. They share everything below the point of proving identity — same token
table, same TTL, same `Authorization` header — because `EmailOtpService` calls
`AuthService.issueTokenFor` rather than minting a session of its own.

---

## Passwordless sign-in (one-time code)

**Added 2026-09-21** at the project owner's request, with migration **V51** (`email_otp_codes`).
The mobile app now **requires an account**: `AppStartGate` shows the sign-in flow before onboarding
and there is no way past it. That reverses the app's original "accounts are optional" posture — the
signed-out code paths still exist and still work, they are simply no longer reachable from a fresh
install.

**There is no separate register call.** The server knows whether an address has an account; a
verified code for an unknown address creates one. Asking the student to choose is asking them a
question the system can already answer, and getting it wrong the moment somebody forgets whether
they signed up.

### POST /api/auth/otp/request
**Purpose:** Email a 6-digit sign-in code.
**Auth:** none
**Request:** `{ email: string }`
**Response:** `200 OK` — `{ message: string, expiresInMinutes: 10, emailed: boolean, code: string|null }`
**Errors:** 400 for a non-Gmail address (`"Please use a Gmail address for now."`), a resend inside the 60-second cooldown (`"A code was just sent. Please wait N seconds…"`), or a sixth code inside a rolling hour (`"Too many codes requested for this email…"`, 2026-09-24). 503 `"We couldn't send the email right now…"` when mail is on and the send failed — the new code is rolled back and any earlier live code stays usable (2026-09-24; it used to be swallowed and reported as sent).
**Business rules:** **Answers identically whether or not the address has an account** — anything else turns this into a membership oracle for any address someone cares to try, the same reasoning behind `login`'s single error message. Requesting a code **retires every earlier live code** for that address, so exactly one can ever be redeemed. `emailed` is false when the deployment has no mail account configured and wrote the code to its log instead; `code` is non-null **only** where `app.mail.expose-code-in-response` is on, which is a developer convenience and never a real deployment.
**Consumers:** Mobile (`auth/SignInFlow.tsx`).

### POST /api/auth/otp/verify
**Purpose:** Redeem a code, returning a session and creating the account on first use.
**Auth:** none
**Request:** `{ email: string, code: string (exactly 6 digits), deviceLabel?: string }`
**Response:** `200 OK` — the same `{ token, expiresAt, user }` shape as `login`.
**Errors:** 400 for a malformed code; 401 `"That code is not valid. Ask for a new one and try again."` for **every** failure — wrong, expired, already used, or attempts exhausted. Distinguishing them would tell an attacker which addresses have a live code outstanding.
**Business rules:** A first-time address gets a `STUDENT` account whose password is a BCrypt hash of random bytes nobody has ever seen — the standard "unusable password" pattern, chosen so `users.password_hash` could stay `NOT NULL` rather than relaxing a column on the busiest table in the schema to serve a new sign-in path. Password sign-in for such an account can therefore never succeed.

### What actually keeps a 6-digit code safe

Six digits is a million possibilities, which is nothing to a script. **The safety is entirely in
these three limits**, so they are named constants in `EmailOtpService` rather than scattered
numbers:

| Limit | Value | Removing it means |
|---|---|---|
| Expiry | 10 minutes | a code stays guessable indefinitely |
| Wrong guesses per code | 5, then the code is dead | **unlimited brute force** |
| Resend cooldown | 60 seconds | the endpoint becomes an inbox flooder |
| Codes per address per hour | 5 (2026-09-24) | sixty emails an hour to one inbox, and far more guesses |

**⚠️ The attempt counter is fragile in a specific way, and it broke once.** A wrong guess reports
failure by throwing `UnauthorizedException` — a `RuntimeException`, which Spring rolls back on by
default. That rollback undid the very increment meant to record the guess, so `attempt_count` never
left 0 and the cap did nothing at all; five wrong guesses followed by the correct one still signed
in. Fixed with `@Transactional(noRollbackFor = UnauthorizedException.class)`. **If that annotation
is ever removed, the cap silently stops working and nothing fails loudly.** Found by running it,
not by reading it — an earlier comment in that file asserted the opposite and was simply wrong.

The code itself is **never stored**, only a BCrypt hash of it, for the same reason passwords are:
this project's dev and production environments share one database.

The email itself (2026-09-24) is a branded HTML message with a plain-text alternative
(`resources/mail/otp-code.html` / `.txt`). The subject leads with the code (what phone notifications
and mail apps' "copy code" read); the code is one unbroken run of text in the body so a long-press
copy gets all six digits. No logo image, support address or policy links yet — none exist, and none
are invented. Logs mask addresses (`v***h@gmail.com`).

### Configuring mail

Off by default, matching this project's posture for anything that leaves the building. With it off
the code is written to the log at WARN and `emailed` is false, so the whole flow is testable with
no mail account — and a deployment with mail **on** never logs a code, so the two paths cannot
overlap.

```
APP_MAIL_ENABLED=true
APP_MAIL_FROM=you@gmail.com
SPRING_MAIL_USERNAME=you@gmail.com
SPRING_MAIL_PASSWORD=<16-character Google app password, NOT the account password>
```

Nothing in the code is Gmail-specific beyond those defaults — `SPRING_MAIL_HOST`/`PORT` point it at
any SMTP provider. Note the `APP_`/`SPRING_` prefixes: Spring relaxed binding needs them, and this
project has already been bitten once by comments that named the bare form.

## Sign in with Google (2026-09-25)

### POST /api/auth/google
**Purpose:** Exchange a Google ID token (from the Google Sign-In SDK on the device) for a session.
**Auth:** none
**Request:** `{ idToken: string, deviceLabel?: string }`
**Response:** `200 OK` — the same `{ token, expiresAt, user }` shape as `login` and `otp/verify`.
**Errors:** 400 when the request has no token, the Google account is not a Gmail address
(`"Please use a Gmail account for now."`), or Google sign-in is not configured on this server.
401 `"Google sign-in could not be verified. Please try again."` for **every** token failure; the
reason is logged, never returned.
**Business rules:**
- **Verified on the server, with only the JDK** (`GoogleIdTokenVerifier`) — no Google client library
  (ADR-003's hand-rolled-auth posture). Every rule Google documents: RS256 signature by a key Google
  publishes at `https://www.googleapis.com/oauth2/v3/certs` (cached per its `max-age`; an unknown
  key id refreshes at most once a minute), `iss` is Google, **`aud` is this app's web client id**,
  not expired (60 s skew), and `email_verified` is true.
- **Account linking is by verified email.** `PasswordlessAccountService` finds or creates the
  account for the lower-cased address, and is also what `otp/verify` uses — so a student who signed
  up with a code and later uses Google (or the reverse) gets **one** account, never two. Safe only
  because both paths prove control of the address first.
- **Gmail only**, the same rule as the code sign-in, so a Workspace address is not a way around it.
- Config: `app.auth.google.web-client-id` / `GOOGLE_WEB_CLIENT_ID` — the **web** OAuth client id
  (not secret; it ships in the app). The Android OAuth clients registered in Google Cloud (package
  `com.sarkaritaiyaari.app` + the SHA-1 of the release and debug signing keys) are what authorise the
  app to request tokens; they are not configured here.
**Consumers:** Mobile (`auth/googleSignIn.ts` -> `authContext.signInWithGoogle`).

---

### POST /api/auth/register
**Purpose:** Create a new student account and sign it in.
**Auth:** none
**Request:** `{ email: string, password: string (min 8 chars), displayName?: string, deviceLabel?: string }`
**Response:** `201 Created` — `{ token: string, expiresAt: string (ISO datetime), user: { id: uuid, email: string, displayName: string|null, role: "STUDENT" } }`
**Errors:** 400 validation failure (bad email, password under 8 chars); 400 `"An account already exists for <email>"` if the email is taken.
**Business rules:** Always creates role `STUDENT` — there is no public path to create an `ADMIN` account. Password has a length floor only (8 chars), deliberately no complexity rules. Token TTL defaults to 365 days (`app.auth.token-ttl-days`), stored server-side in `user_tokens` (opaque, not a JWT — ADR-001). `deviceLabel` is an optional free-text label for the signing-in device (e.g. "Redmi Note 12"), stored alongside the token so a user could later tell sessions apart.
**Consumers:** Mobile only. Admin has no self-service sign-up screen — admin accounts are created via `/api/auth/admin/register` (see below) or the bootstrap runner.

### POST /api/auth/login
**Purpose:** Sign in an existing account (student or admin) and issue a new token.
**Auth:** none
**Request:** `{ email: string, password: string, deviceLabel?: string }`
**Response:** `200 OK` — same shape as register: `{ token, expiresAt, user: { id, email, displayName, role } }`. `role` in the response is how a client knows whether it signed in an admin.
**Errors:** 400 validation failure (blank email/password); 401 `"Email or password is incorrect"` for either a wrong password or an unknown email — deliberately the same message for both, to avoid letting a caller enumerate registered addresses. A failed login runs a real BCrypt comparison against a dummy hash even when no user matches, so the response takes the same time either way.
**Business rules:** Issuing a new token does not revoke any of the account's other tokens — logging in on a second device leaves the first signed in. Expired tokens are opportunistically swept (`tokenRepository.deleteExpired`) on every successful login.
**Consumers:** Both — mobile (student sign-in) and admin (admin console sign-in) call the same endpoint; the returned `role` is what the admin console checks to accept the session.

### POST /api/auth/logout
**Purpose:** Revoke the calling device's token.
**Auth:** user (Bearer token)
**Request:** none (token comes from the `Authorization` header)
**Response:** `204 No Content`
**Errors:** 401 if the header is missing, malformed, or the token isn't found/already expired.
**Business rules:** Revokes only this device's token — other devices/sessions for the same account stay signed in. (There is a separate, currently unexposed `AuthService.logoutAllDevices` for a "sign out everywhere" flow; no controller calls it today.)
**Consumers:** Both.

### GET /api/auth/me
**Purpose:** Let the app check whether a stored token is still valid, and fetch the current user's profile, on launch.
**Auth:** user (Bearer token)
**Request:** none
**Response:** `200 OK` — `{ id: uuid, email: string, displayName: string|null, role: string }` (the `UserResponse` shape, not wrapped in the full `AuthResponse` — no token/expiresAt here).
**Errors:** 401 if the token is missing, unknown, or expired ("Session expired — please sign in again" vs "Not signed in" depending on which).
**Business rules:** None beyond the standard token resolution.
**Consumers:** Both.

### POST /api/auth/admin/register
**Purpose:** Create another admin account.
**Auth:** admin (Bearer token + ADMIN role)
**Request:** `{ email: string, password: string (min 8 chars), displayName?: string, deviceLabel?: string }` — same `RegisterRequest` shape as the public register endpoint.
**Response:** `201 Created` — `{ id: uuid, email: string, displayName: string|null, role: "ADMIN" }` (the bare `UserResponse`, **no token**).
**Errors:** 401 not signed in / expired; 403 `"Admin access required"` if the caller is a signed-in STUDENT; 400 if the email is already registered.
**Business rules:** Deliberately issues no token for the new account — the creating admin never holds the new admin's session; the new admin signs in themselves via the normal `/login` flow. This is the *only* way to create additional admins after the first: the very first admin is instead created by `AdminBootstrapRunner` on startup, from `admin.bootstrap-email`/`admin.bootstrap-password` (gitignored local config, see `application-local.yml.example`), and only when no `ADMIN`-role user exists yet — it's idempotent and a no-op on every later restart.
**Consumers:** Neither mobile nor the admin web app currently calls this — there's no UI for it (confirmed by grepping `admin/src/api.js` and `mobile/src/api/*`). Reachable only by direct API call (e.g. curl/Postman) by an existing admin, presumably how a second real admin account gets provisioned today.

---

## Facts worth flagging

- **Bearer token is opaque, not a JWT.** It's a 32-byte random value, base64url-encoded, looked up in `user_tokens` on every authenticated request — a deliberate choice (ADR-001) to make revocation a plain delete rather than requiring a blocklist.
- **Default token TTL is 365 days**, configurable via `app.auth.token-ttl-days`.
- **`/api/auth/admin/register` has no consumer in either client app.** It exists and is fully wired (admin-gated, tested logic), but is presently only reachable by a direct HTTP call — there is no "invite an admin" button anywhere in the admin UI.
- **The first admin can only come from server-side config**, never from an API call — `AdminBootstrapRunner` runs once, at startup, and only if zero admins exist yet.
