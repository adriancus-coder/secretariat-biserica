# Security

How the app protects church data, what an attacker could aim at, and what to do when something goes wrong.

## Threat model

The data is personal and sensitive: names, birth dates, addresses, phone numbers, baptism details, family links, meeting minutes with signatures. Each church's secretariat is a small team; most users are not technical.

| Threat | Mitigation |
| --- | --- |
| One church reads or changes another church's data | Every query goes through the tenant-scoped client (`scopeToChurch`); `churchId` only comes from the session. Nested writes and raw SQL check ids by hand. `tests/integration/tenant-isolation.test.ts` covers every tenant model. |
| A user does more than their role allows | Permissions are checked on the server in every page, route handler and action (`requireCtx`, `actionCtx`); hidden buttons are only cosmetic. |
| Stolen or guessed password | scrypt hashes; minimum 10 characters, checked against the 10 000 most common passwords and the user's own name and e-mail; per-account lock after repeated failures (silent: a locked account answers like an unknown address, with the same scrypt work; only the right password learns about the lock); signup with a registered address gets a neutral answer and an e-mail to that account; per-IP limits on login, signup, forgot password and 2FA codes; optional or church-required second factor (authenticator app or e-mail code, recovery codes). |
| Stolen session | 24-hour JWT sessions in an httpOnly, `SameSite=Lax`, `Secure` cookie; the user is reloaded from the database on every request, so deactivation, a role change, a password change or "Deconectează-te de pe toate dispozitivele" (`sessionVersion`) end sessions at once. |
| Cross-site scripting | React escaping; Content-Security-Policy with a per-request nonce and `'strict-dynamic'` for scripts, no `'unsafe-inline'` for scripts; `object-src 'none'`, `base-uri 'self'`. |
| Clickjacking, cross-site form posts | `frame-ancestors 'none'` and `X-Frame-Options: DENY`; `form-action 'self'`; server actions check the `Origin` header (Next.js). |
| Downgrade to HTTP | `Strict-Transport-Security: max-age=31536000; includeSubDomains` and `upgrade-insecure-requests` when `APP_URL` is HTTPS. |
| Abuse of public forms (applications, forgot password) | Honeypot field, per-IP and per-church rate limits, the same answer whether or not an account exists. |
| Vulnerable dependencies | CI runs `npm audit` (high and critical findings fail the build, see below) and GitHub's dependency review on pull requests. |
| Leaks through logs | Tokens, links, codes, recipients, signatures and document contents are never logged. Only truncated IP addresses are stored (last login, audit). |

Out of scope: a compromised Render account or database host, and a compromised administrator account (an administrator can export everything; exports require the password again and are audited).

## What is hashed or encrypted

| Data | Storage |
| --- | --- |
| Passwords | scrypt (N=2^15, r=8, p=3), per-user random salt (`src/server/password.ts`) |
| Invitation and password-reset links, login challenges | sha256 of a random 32-byte token; the token itself only reaches the user |
| 2FA recovery codes | 12 random characters (~59 bits), scrypt (N=2^14, r=8, p=1), single use; older 8-character codes (sha256) stay valid until the user regenerates them |
| E-mail codes | sha256, single use, 10 minutes, compared in constant time |
| Authenticator (TOTP) secrets | AES-256-GCM, key derived from `AUTH_SECRET` with HKDF (`src/server/two-factor.ts`); a new secret waits in `pendingTotpSecretEnc` until its first code confirms it, so an abandoned setup never replaces the working one |
| Sessions | JWT signed and encrypted by Auth.js with `AUTH_SECRET` |
| Signatures, statutes, all register data | PostgreSQL only (Render encrypts the disk at rest); nothing is written to the file system |
| Uploaded files for extraction or .docx import | Read in memory, never stored |
| Last-login IP | Truncated (`1.2.3.x`, `2001:db8:1::x`) |

Rotating `AUTH_SECRET` therefore also makes the stored TOTP secrets unreadable: users with an authenticator app then sign in with an e-mail code or a recovery code and set the app up again.

## Removing a person (GDPR erasure)

An administrator chooses between deleting the person for good and anonymising the record. Anonymising keeps what the statistics need (statut, gender, dates, family) and removes everything else:

- the name becomes "Persoană ștearsă"; contact data, notes, roles, groups, remembered name forms, mențiuni and drawn signatures are deleted;
- the linked membership application is blanked and unlinked;
- the person's and the application's earlier audit entries keep only when and who;
- the name (in both word orders), the phone number and the e-mail address are replaced in minutes, e-mail send lists, events, groups, notes, families and all audit entries of the church.

Documents already issued in the outgoing register (certificates, letters) keep the name: they are an official record of what the church issued. The confirmation step says so. `tests/integration/anonymize.test.ts` checks that no other table keeps the name, phone or e-mail.

## Response headers

- `Content-Security-Policy` is built per request in `src/proxy.ts` (`src/lib/csp.ts`): `script-src 'self' 'nonce-…' 'strict-dynamic'` (plus `'unsafe-eval'` only in development, for React's debugging tools). Next.js reads the nonce from the request header and adds it to its own scripts, so every page is rendered dynamically. Styles keep `'unsafe-inline'` (React `style` attributes); that is accepted, scripts are what matters.
- PDF responses (`/pdf/**`, statutes) get no CSP so the browser's PDF viewer works.
- `next.config.ts` sets HSTS (1 year), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a minimal `Permissions-Policy` (camera, microphone, geolocation, payment, USB and interest-cohort off).

## "Forbidden" status codes

- Route handlers (`/pdf/**`, `/api/export`) answer **HTTP 403** when the role lacks the permission.
- Server actions answer with the form message (for example "Nu aveți drept de …"); actions always answer HTTP 200 by Next.js design, and nothing is written.
- Pages keep the "Acces restricționat" page (`src/app/forbidden.tsx`) with **HTTP 200**: the `(app)` pages stream behind `loading.tsx`, and a streamed response has already sent its status when `forbidden()` runs. Next.js then adds `<meta name="robots" content="noindex">`. Moving the permission check into `src/proxy.ts` would give a 403, but the proxy has no database access and the role must come from the database, so we keep it this way.

## Dependency audit

- `npm run audit:check` (`scripts/audit-check.mjs`) runs `npm audit` and fails on any high or critical finding.
- A finding that cannot be fixed yet and only affects development tools goes into `audit-allowlist.json` with the package, the advisory URLs, a reason and an expiry date (at most 3 months). After the expiry date the finding fails CI again, so it is looked at again.
- `.github/workflows/dependency-review.yml` fails a pull request that adds a dependency with a high or critical vulnerability.

## Incident steps

Act in this order. Write down what happened and when; tell the affected churches if their data may have been read.

1. **Contain**: in Render, suspend the web service if the attack is ongoing. Deactivate any compromised user in Setări → Utilizatori (this ends their sessions at once).
2. **Revoke API keys**: create new keys and delete the old ones for Resend (`RESEND_API_KEY`) and Anthropic (`ANTHROPIC_API_KEY`); update them in Render → Environment.
3. **Rotate `AUTH_SECRET`**: set a new random value (`openssl rand -base64 32`) in Render. This signs everyone out. Authenticator apps must be set up again (see above); e-mail codes and recovery codes keep working.
4. **Rotate database credentials**: in Render → PostgreSQL, rotate the password (or create a new user), update `DATABASE_URL` on the web service, then redeploy. Check Render's access logs for unknown connections.
5. **Review**: Setări → Jurnal (audit log) for unexpected changes, exports and logins; Render logs for the period.
6. **Restore** if data was changed or deleted: from a Render backup (point-in-time) or the latest monthly JSON export, on a copy first.
7. **Fix and redeploy**, then turn the service back on and tell the users what to do (new password, set up 2FA again).

## Backup policy

- **Render PostgreSQL backups**: daily, with point-in-time recovery for the plan's retention window. Test a restore into a new database at least twice a year.
- **Monthly JSON export**: an administrator of each church downloads Setări → Copie de siguranță → Export on the first working day of the month and keeps it on an encrypted, church-owned drive (not a personal e-mail). The export contains every record, signatures included, so treat it as sensitive.
- Keep at least the last 12 monthly exports; delete older ones.
- Before any import in "replace" mode, export first.
