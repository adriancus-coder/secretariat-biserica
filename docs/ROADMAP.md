# Roadmap

Target: take the app live for **Maranata Stavanger**. Working rules are in [`CLAUDE.md`](../CLAUDE.md).

## Current state

All 9 modules from the original brief are implemented on `dev`:

| # | Module | State |
| --- | --- | --- |
| 1 | Acasă: statistics, retroactive year view | done |
| 2 | Persoane: register, search, pagination, families, audit trail | done |
| 3 | Procese-verbale, with PDF | done |
| 4 | Calendar with agapă, with PDF | done |
| 5 | Documente: register with yearly numbering, generated text, PDF | done |
| 6 | Dare de seamă: any year, saved as a document | done |
| 7 | Grupuri, with a PDF list | done |
| 8 | Mențiuni | done |
| 9 | Setări: organisation, nomenclatures, users and roles, JSON export/import, audit log | done |

Since the original brief:

- Membership applications: public form `/cerere/<slug>`, review and acceptance into the register (`/cereri`).
- Church roles (funcții) per person, with the committee shown on Acasă and usable as a Persoane filter.
- Attendance rules per meeting type: automatic attendee lists, absentees and quorum in the minutes.
- Families as records defined by their head (`/familii`), replacing the free-text family name.
- Minutes numbered per year and printed in the church's format; reading scanned documents and photos with Claude (person and minutes drafts).

Also in place:

- Multi-church data isolation.
- The three roles.
- Server-side PDFs with letterhead and signatures.
- An audit log.
- Parity tests against the prototype.
- PostgreSQL integration tests.
- CI running `npm run check`.

## Decisions

- **No finances.** Donations, budgets and accounting stay out of scope.
- **No pastoral visits.** Visit tracking stays out of scope.
- **Multi-church from day one:**
  - every church's data is isolated;
  - a user belongs to exactly one church;
  - administrators invite users;
  - new churches register only when `ALLOW_SIGNUP=true`, or while the database is empty.
- **Roles:**
  - Administrator: everything, including settings, users and import.
  - Secretar: registers, documents, export and the audit log.
  - Vizualizare: read and print only.
- **The prototype is the functional spec.** Deliberate deviations are listed in README, "Diferențe față de prototip".
- **Hosting and e-mail:** Render (Frankfurt, web service plus managed PostgreSQL) and Resend for e-mail.
- **Security baseline** (`docs/SECURITY.md`): nonce-based CSP without `'unsafe-inline'` for scripts, HSTS, CI `npm audit` gate with an expiring allow-list (`audit-allowlist.json`) and dependency review on pull requests. Pages denied by role keep the "Acces restricționat" page with HTTP 200 (streamed); route handlers answer 403.

## Next steps (priority order)

1. **Render + Resend**:
   - Done on `dev`: Render Blueprint (`render.yaml`), `/api/health`, invitation and password-reset e-mails through Resend, and the public `/am-uitat-parola` page.
   - First deploy on Render done on 2026-10-05: https://secretariat-biserica.onrender.com (service and database in Frankfurt, following `dev`).
   - Remaining, manual:
     - verify the sender domain in Resend and set `RESEND_API_KEY`;
     - send a real invitation and a real password reset;
     - when real data is in, fast-forward `main` to `dev` and point the Render service at `main`.
2. **Data migration from membriibiserica.ro:**
   - export the current register;
   - convert it to the prototype JSON format;
   - import it through Setări → Copie de siguranță, with a dry run on a copy first.
3. **Playwright E2E tests for the 3 roles:** the main flows per role, run in CI.
4. **Shared rate limits:** the per-IP limits (login, signup, forgot password, 2FA code) and the per-account lockout live in process memory; scaling to several instances needs a shared store (PostgreSQL or Redis).
5. **Per-church time zone:** `Church.timeZone` instead of the global `APP_TIME_ZONE`.
6. **Attachments:** scanned files on documents and meeting minutes. This needs object storage.
7. **SMS code as an extra factor** for the data-update campaign's identity check (after name + phone). This needs an SMS provider.

## Known limitations and tech debt

- Existing screens predate the UI rules in `CLAUDE.md`: most primary buttons have no icon. Audit and align these screen by screen.
  - Button heights are fixed: `.btn` is at least 44 px and `.btn-sm` at least 40 px. Small controls that are not `.btn` (calendar day cells, pager links, inline text links) have not been audited yet.
- Absentees are computed from today's register as of the meeting date (who was a member, who held a committee role then). Editing a meeting saved before the attendance rules computes its absentees for the first time; role history only exists from the `din` dates entered.
- Role end dates (`until`) are stored and exported but not yet editable in the UI.
- Imported Word minutes (.docx) are not stored either: only the meeting saved from them is kept. A batch is limited to 25 MB in total by the request body limit, besides 5 MB per file and 30 files.
- Documents read with Claude are not stored (no object storage yet); HEIC photos are not converted on the server (phones send JPEG through the file picker).
- `Person.familieVeche` (the family text before families became records) is still in the database. Drop it in a migration once production has run a release with families.
- Person search no longer includes the family name; rows saved before families became records still contain the old family text until they are saved again.
- The `/am-uitat-parola` limit is kept in process memory: 3 requests per e-mail address per 15 minutes.
  - It resets when the app restarts and is not shared between instances. That is fine for the single Render instance.
  - Move it to PostgreSQL or Redis before running more than one instance; this belongs with step 4.
- Older code comments and most of the README are in Romanian.
- Auth.js v5 is still a beta release.
- Every page renders dynamically because of the CSP nonce (no static pages or ISR); fine for an app behind a login.
- The style CSP keeps `'unsafe-inline'` (React `style` attributes).
- Pages forbidden by role answer HTTP 200 with the "Acces restricționat" page (see `docs/SECURITY.md`).
- Security tasks for the owner: test a Render database restore twice a year; each church downloads a monthly JSON export.
- Date fields use the browser's native date picker.
