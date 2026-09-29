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

## Next steps (priority order)

1. **Render + Resend**:
   - Done on `dev`: Render Blueprint (`render.yaml`), `/api/health`, invitation and password-reset e-mails through Resend, and the public `/am-uitat-parola` page.
   - Remaining, manual:
     - first deploy on Render;
     - verify the sender domain in Resend;
     - send a real invitation and a real password reset.
2. **Data migration from membriibiserica.ro:**
   - export the current register;
   - convert it to the prototype JSON format;
   - import it through Setări → Copie de siguranță, with a dry run on a copy first.
3. **Playwright E2E tests for the 3 roles:** the main flows per role, run in CI.
4. **Rate limiting on `/autentificare` and `/inregistrare`:** per IP. Today there is only a per-account lockout (5 failed logins lock the account for 15 minutes).
5. **Per-church time zone:** `Church.timeZone` instead of the global `APP_TIME_ZONE`.
6. **Attachments:** scanned files on documents and meeting minutes. This needs object storage.

## Known limitations and tech debt

- Existing screens predate the UI rules in `CLAUDE.md`:
  - `.btn` buttons are about 41 px high and `.btn-sm` about 31 px, below the 44 px target;
  - most primary buttons have no icon.

  Audit and align these screen by screen.
- The `/am-uitat-parola` limit is kept in process memory: 3 requests per e-mail address per 15 minutes.
  - It resets when the app restarts and is not shared between instances. That is fine for the single Render instance.
  - Move it to PostgreSQL or Redis before running more than one instance; this belongs with step 4.
- Older code comments and most of the README are in Romanian.
- Auth.js v5 is still a beta release.
- Date fields use the browser's native date picker.
