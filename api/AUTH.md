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
