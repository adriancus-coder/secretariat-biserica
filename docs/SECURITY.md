# Security

How the app protects church data, what an attacker could aim at, and what to do when something goes wrong. The technical design (stack, tenant isolation, authentication flow, encryption) is in [ARCHITECTURE.md](ARCHITECTURE.md).

## How to report a vulnerability

Please report security problems privately, never in a public issue or pull request:

- **Preferred:** GitHub's private vulnerability reporting — the repository's **Security** tab → **Report a vulnerability**.
- **Or by e-mail:** secretariat@sanctuaryvoice.com, with "Security" in the subject.

Include what you found and where (page, route or file), the steps to reproduce it, what an attacker could read or change, and the version (commit) if you know it. Do not access, change or keep other people's data beyond what is needed to show the problem, and do not test against a church's production data: use a local copy with the demo church (`npm run db:seed`).

We confirm receipt within **3 working days**, give a first assessment within **10 working days**, and fix critical problems as fast as possible (usually within days). We tell you when the fix is deployed and credit you in the release notes if you wish.

## Threat model

The data is personal and sensitive: names, birth dates, addresses, phone numbers, baptism details, family links, meeting minutes with signatures. Each church's secretariat is a small team; most users are not technical.

| Threat | Mitigation |
| --- | --- |
| One church reads or changes another church's data | Every query goes through the tenant-scoped client (`scopeToChurch`); `churchId` only comes from the session. Nested writes and raw SQL check ids by hand. `tests/integration/tenant-isolation.test.ts` covers every tenant model. |
| A user does more than their role allows | Permissions are checked on the server in every page, route handler and action (`requireCtx`, `actionCtx`); hidden buttons are only cosmetic. |
| Stolen or guessed password | scrypt hashes; minimum 10 characters, checked against the 10 000 most common passwords and the user's own name and e-mail; per-account lock after repeated failures (silent: a locked account answers like an unknown address, with the same scrypt work; only the right password learns about the lock); signup with a registered address gets a neutral answer and an e-mail to that account; per-IP limits on login, signup, forgot password and 2FA codes; optional or church-required second factor (authenticator app or e-mail code, recovery codes). |
| Phishing or a stolen password used from elsewhere | Passkeys (WebAuthn: bound to the app's address, so a look-alike site gets nothing; user verification required; challenges single use, 2 minutes, bound to the purpose and the user; the signature counter must increase; 10 attempts per 15 minutes). A church can require "parolă + Face ID / amprentă" for its staff; with that policy on, every sign-in with a recovery code is shown to administrators on Acasă. |
| Someone at an unlocked, signed-in device | Step-up for exports, discipline, pastoral notes, users and security settings: a fresh device unlock (or the password) valid 15 minutes, bound to the session version. A saved signature is placed on a document only after a device unlock for that exact document. |
| A pastor's decisions or confidential notes reached by other staff | Approvals (documents, applications, reabilitări, excluderi) are checked for the pastor flag on the server; pastoral notes are readable only by pastors, encrypted at rest and never exported or logged (see "Pastoral notes"). |
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
| Pastoral notes | AES-256-GCM, key derived from `AUTH_SECRET` with HKDF (purpose `pastoral-note-v1`, `src/server/secret-box.ts`); see "Pastoral notes" |
| Sessions | JWT signed and encrypted by Auth.js with `AUTH_SECRET` |
| Signatures, statutes, all register data | PostgreSQL only (Render encrypts the disk at rest); nothing is written to the file system |
| Uploaded .docx minutes | Read in memory, never stored |
| Last-login IP | Truncated (`1.2.3.x`, `2001:db8:1::x`) |

### Rotating `AUTH_SECRET`

A new `AUTH_SECRET` makes everything encrypted under it unreadable: the authenticator (TOTP) secrets and the pastoral notes. Re-encrypt them first, then change the secret:

1. Generate the new value (`openssl rand -base64 32`) and keep it out of chat, e-mail and the repository.
2. From a machine that can reach the production database (Render → PostgreSQL → External connection):
   `OLD_AUTH_SECRET=<current> AUTH_SECRET=<new> DATABASE_URL=<external URL> npm run secrets:reencrypt` (a dry run that only counts), then the same command with `-- --apply`. It runs in one transaction; a value the current secret cannot open stops it and nothing changes. It prints counts only.
3. Set the new `AUTH_SECRET` in Render → Environment right away and redeploy (until then, notes written in between are under the old key: run step 2 again if a pastor wrote one).
4. Everyone is signed out (sessions, step-up and export grants are signed with the secret). Personal campaign links that were already sent keep working; "Copiază linkul" shows a new address after a rotation, so use "Generează link nou" for a link that must be sent again.

Re-encrypt even when the old secret leaked: the values are then protected by the new one. Only when the old secret is lost: users with an authenticator app sign in with an e-mail code or a recovery code and set the app up again, and the pastoral notes stay unreadable (the app says so instead of showing them).

## Service providers

Only two providers process personal data on the church's behalf:

- **Render** (Render Services, Inc.): hosting of the app and the PostgreSQL database, in the EU (Frankfurt).
- **Resend** (Resend, Inc.): sending the app's e-mails (invitations, password reset, codes, minutes, notices).

Both are US companies; transfers rely on the EU–US Data Privacy Framework or standard contractual clauses. No AI service processes personal data: reading scanned documents with an AI provider was withdrawn at the church's request (2026-10), with its code, settings column (`extract_remove` migration) and dependencies. Older audit entries of that kind (`EXTRACT`) stay readable as "Citire document (funcție retrasă)"; nothing writes them any more. Push notifications go through the browser vendor's push service with no personal data (see "Aplicația instalată").

## Third-party data

- `src/lib/postal-codes-no.json` (Norwegian postal codes and localities, used by `formatAddress` and the address forms): Postnummerregister © Posten Bring AS, licență NLOD (Norsk lisens for offentlige data). Bundled with the app; no request leaves the server for it.

## Person-list export

`POST /api/persoane/export` (Administrator and Secretar) asks for the password again, then trusts a signed, httpOnly 10-minute grant cookie for the same user (`src/server/export-grant.ts`). Each export writes a SECURITY audit entry with the categories, the row count and the format — never the names.

## Disciplinary measures

Measures (Statut art. 27, 271, 272) are the most sensitive records. They are readable and writable only with the `disciplina` permission (pastors and administrators), after the step-up, checked on the server in every page, route handler and action (`requireCtx("disciplina")` / `actionCtx("disciplina")`). Secretaries and viewers never receive them in any page, list, count, category, export, PDF, audit view (entity DISCIPLINE is filtered out of the journal) or error message. Two server-side effects exist without showing anything: a member with an applied suspension is not counted among the expected attendees of a "Toți membrii" meeting, and a recommendation for a person with an open measure can be issued only by a pastor or an administrator. The measures are in the full JSON backup only when an administrator exports it, and are deleted when the person is anonymised.

## Pastoral notes

Confidential notes of the pastors about a person (Statut art. 39 alin. 3), on the person page.

- **Who can read them:** only users marked as pastor (`pastoral` permission, checked on the server in the page, the actions and the PDF route), after the step-up (device unlock or password, valid 15 minutes). Every pastor of the church sees every note; each changes or deletes only their own. Administrators who are not pastors, secretaries and viewers never receive them: not on any page, list, count, category, search, export, JSON backup, copy of data (art. 15) or error message.
- **At rest:** the text is encrypted with AES-256-GCM under a key derived from `AUTH_SECRET`, so a database dump or backup alone does not reveal it. What the operator can technically see: whoever holds both the database and `AUTH_SECRET` (the hosting account, the Render environment) can decrypt them; the database alone shows only which person has notes, who wrote them and when.
- **Log:** the audit log keeps only "notă pastorală adăugată / modificată / ștearsă" and "note pastorale exportate (PDF)" with the author and the person (entity PASTORAL, shown only to pastors); never the text.
- **Export:** "Exportă notele pastorale (PDF)" (pastors, after the step-up) — treat the file as strictly confidential. The JSON backup never contains the notes: they are lost if the database is lost, by design.
- **Erasure:** anonymising or deleting the person deletes the notes; their log entries lose the name.
- **Key rotation:** see "Rotating `AUTH_SECRET`" (re-encrypt first).

## Aplicația instalată (installed app)

The app can be installed from the browser (Android, iPhone / iPad from iOS 16.4, computers). The rule: **nothing about the church or its people is stored on the device** by the app.

- **What the device keeps:** the service worker (`public/sw.js`) caches only static files of the current version — the hashed JavaScript / CSS bundles and fonts under `/_next/static`, the icons and the offline page — in a cache named after the version; older versions' caches are deleted on update. Pages, PDFs, Word and Excel files, API answers, server actions, the application form and the data-update form are always fetched from the network and never cached (`tests/unit/service-worker.test.ts` asserts this for every such route). Without a connection the app shows "Nu există conexiune…" instead of old data.
- **What the browser itself keeps** is the same as for the website: the session cookie (httpOnly), the theme and text-size cookies, and files the user downloads (PDF, Word, Excel) — those are the user's responsibility.
- **Sign-out:** "Ieșire din cont" is a full request to `/deconectat`, which ends the session and answers with `Clear-Site-Data: "cache"`; the sign-in page then asks the service worker to delete every cache except the static one (also after an expired session).
- **Push notifications:** sent with VAPID through the browser vendor's push service (Google, Apple, Mozilla, Microsoft), end-to-end encrypted with the subscription's keys. The payload is only a generic title ("Un document așteaptă semnătura dumneavoastră"), the address to open inside the app and the number of waiting items — never a name, a document, a person or any other personal data. Only users who can act on an item are notified; at most one notification per user and type every 5 minutes. The server stores per device the push endpoint and its public keys and a short device name ("Chrome pe Android"), never the full user agent; a subscription the browser drops (404 / 410) is deleted, and "Elimină" in Cont removes one.
- **App badge:** the number of waiting items on the icon (where the system supports it); a count, nothing else.
- **Removing the app and its data:** uninstall the app (long-press the icon → Dezinstalează / Elimină aplicația; on a computer the app menu → Dezinstalează), then in the browser's site settings choose "Clear data" for the app's address; turn notifications off in Cont → Notificări → Elimină (or in the system's notification settings). Signing out on a shared device is enough to remove every cached response that is not a static file.

## Contact data after an exit

After any exit (exit date or Fost membru), phone, e-mail and address are visible only to administrators (lists, person page, edit form, groups, person export and JSON backup of other roles leave them out). Twelve months after the exit they are listed on Acasă for administrators and deleted with "Șterge acum" (one transaction, audited with the count). Register data (Statut art. 14 alin. 3 lit. a) are never deleted. A person can ask for a copy of their data (art. 15 GDPR): administrators download it as PDF or JSON from the person page; each copy is audited.

## Data-update campaign and consents

- **What it collects:** an adult's own register and contact data (name, gender, birth and marriage dates, phone, e-mail, address, baptism, parents' names) and their own minor children's (name, gender, birth date, blessing), the confirmation of the privacy notice and four optional consents (photos and films, birthday announced, announcements by WhatsApp / SMS / e-mail, the church contact list) for each. Never notes, roles, groups, status or discipline.
- **Identity check:** a personal link is a 43-character token (an HMAC of the link id and a random nonce under a key derived from `AUTH_SECRET`; only its sha256 and the nonce are stored, so a new link revokes the old one). Opening it asks for the full name and the phone number; both must match the link's person (diacritics, order and phone prefixes ignored), the answer never says which part failed, 5 wrong answers lock the link, and every visitor gets 20 checks per hour. A confirmed identity lasts 30 minutes (signed httpOnly cookie bound to the link). The general link (QR code) never shows or hints at register data: the form is always empty and the typed name and phone travel in an encrypted cookie; the match is made only for the secretary.
- **Approval:** nothing reaches the register before the secretary approves it field by field ("De verificat"); every change is audited with the campaign's name.
- **Legal basis:** register and contact data are kept as the records of a religious nonprofit's members (Statut art. 14; GDPR art. 6 alin. 1 lit. f and art. 9 alin. 2 lit. d); consent (art. 6 alin. 1 lit. a and art. 9 alin. 2 lit. a) only for the four optional purposes. Refusing has no consequence.
- **Retention and withdrawal:** consents are kept until withdrawn ("Retrage acordul" in the app, or by asking the secretariat); submissions and rejected answers are deleted within 12 months; anonymising a person removes their consents, links and submissions. Each answer stores the notice version it refers to ("1.2" for the model notice, a hash for a church's own text, the older hash for answers given before 1.2) and its source (online, paper).

## Upload and input limits

- Signatures: PNG only, at most 2 MB; images declaring more than 4 000 000 pixels are refused before decoding (`limitInputPixels`), then re-encoded at most 600×200 px and 40 KB.
- Word files: at most 5 MB, and the uncompressed size declared by the ZIP's central directory must stay under 50 MB (`src/server/zip-size.ts`), checked before mammoth unpacks anything.
- Arguments that the client binds to server actions (booleans, directions) are parsed with zod like form fields.
- Unexpected errors are logged by `logError()` (`src/server/log.ts`): a short id, the error name and code and the first line of the message with e-mail addresses masked; never the error object or request data.

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
2. **Revoke API keys**: create a new key and delete the old one for Resend (`RESEND_API_KEY`); update it in Render → Environment.
3. **Rotate `AUTH_SECRET`**: follow "Rotating `AUTH_SECRET`" above (re-encrypt the authenticator secrets and pastoral notes, then set the new value in Render). This signs everyone out.
4. **Rotate database credentials**: in Render → PostgreSQL, rotate the password (or create a new user), update `DATABASE_URL` on the web service, then redeploy. Check Render's access logs for unknown connections.
5. **Review**: Setări → Jurnal (audit log) for unexpected changes, exports and logins; Render logs for the period.
6. **Restore** if data was changed or deleted: from a Render backup (point-in-time) or the latest monthly JSON export, on a copy first.
7. **Fix and redeploy**, then turn the service back on and tell the users what to do (new password, set up 2FA again).

## Backup policy

What Render actually provides (check the dashboard when the plan changes):

- **Logical backups** (a database dump): created on demand from the database's page in Render (Recovery → Export), kept for 7 days. Download one before risky changes (a large import, a migration by hand).
- **Point-in-time recovery**: restores the database as it was at a chosen moment, into a new database. How far back depends on the workspace plan: about 3 days on Hobby, 7 days on Professional. It is not a long-term archive.
- So the long-term copy is the church's own JSON export:
  - **weekly** while the workspace is on the Hobby plan, **at least monthly** on a paid plan;
  - an administrator downloads Setări → Copie de siguranță → Export and keeps it on an encrypted, church-owned drive (not a personal e-mail); the file contains every record, signatures included, so treat it as sensitive;
  - keep at least the last 12 exports; delete older ones;
  - the app reminds administrators: a banner on Acasă and a line in Setări → Copie de siguranță when the last export (the SECURITY audit entry "Export date") is older than 30 days, or there has never been one.
- Before any import in "replace" mode, export first.
- **Test a restore** twice a year: restore a point in time (or a logical backup) into a new Render database, point a local copy of the app at it (`DATABASE_URL`), check that the latest records are there, then delete the test database. Also import the latest JSON export into an empty local database (`npm run db:deploy`, then Setări → Import with "înlocuire") to prove the file is complete.

## Third-party data

- `src/lib/postal-codes-no.json`: Postnummerregister © Posten Bring AS, licență NLOD. Public postal codes only; no personal data.
