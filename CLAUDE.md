# Secretariat Biserică: instructions for Claude

Church secretariat web app. It covers the person register, meeting minutes (procese-verbale), a calendar with agapă, the outgoing document register, the annual report (dare de seamă), groups, notes (mențiuni) and settings.

- Multi-church with full data isolation.
- Roles: Administrator / Secretar / Vizualizare.
- User interface in Romanian, mobile-first.
- First production church: Maranata Stavanger (Norway).

- Functional spec: `prototip/secretariat-biserica.html`, the original single-file prototype. **Never edit it**: the parity tests execute its code.
- `README.md`: setup, environment variables, migrations and deployment.
- Deployment: `render.yaml` (Render Blueprint) with the health check `/api/health`. The steps are in README, "Deploy on Render".
  - Production: https://secretariat-biserica.onrender.com. The Render service follows `dev`, so every push to `dev` goes live.
  - In production, `APP_URL` and `AUTH_URL` both hold the public address. Behind Render's proxy, Next.js only sees `https://localhost:10000`.
- `docs/ROADMAP.md`: decisions and priorities.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

`next dev` keeps the block above in this file. `AGENTS.md` is only a pointer to this file.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run check` | Lint, typecheck, all tests and the production build. **Must pass before every commit.** |
| `npm test` | Vitest, unit and integration. Integration tests need `TEST_DATABASE_URL`, and that database is truncated on every run. |
| `npm run db:deploy` | Apply the existing migrations |
| `npm run db:migrate -- --name <name>` | Create a migration after a schema change (development only) |
| `npm run db:seed` | Load the demo church: `admin@demo.ro`, `secretar@demo.ro`, `vizualizare@demo.ro`, password `demo1234` |

Never run `prisma migrate reset` / `npm run db:reset` or any other destructive database command unless the owner explicitly asks. Prisma itself refuses resets started by an AI agent without the user's consent; do not bypass that.

## Stack notes (newer than most training data)

- **Next.js 16.3** (App Router, Turbopack):
  - `src/proxy.ts` replaces middleware.
  - `params` and `searchParams` are Promises.
  - The global types `PageProps<"/route">` and `RouteContext<"/route">` come from `next typegen`, which runs inside `npm run typecheck`.
  - `forbidden()` relies on `experimental.authInterrupts`.
- **React 19.2**: `<form action={fn}>` resets the form after every submit, including after a validation error. Forms whose input must survive errors use `useActionForm`.
- **Prisma 7.10**:
  - The `prisma-client` generator writes to `src/generated/prisma`. That directory is gitignored and generated on `npm install`.
  - Import from `@/generated/prisma/client`.
  - Configuration is in `prisma.config.ts`, with the driver adapter `@prisma/adapter-pg`.
  - The package is ESM (`"type": "module"`).
- **Auth.js v5 beta** (`next-auth@5.0.0-beta.32`): Credentials provider with 7-day JWT sessions.
  - `src/auth.config.ts` has no database access; the proxy uses it.
  - `src/auth.ts` adds the database-backed provider.
- **Other libraries**:
  - Zod 4 with the Romanian locale.
  - Tailwind 4: `@theme inline` in `src/app/globals.css` maps the prototype's CSS variables.
  - pdfkit with embedded Source Serif 4 fonts (`assets/fonts`).
  - Vitest 5 with the projects `unit` and `integration`, run with `TZ=Europe/Bucharest`.

## Layout

```
prototip/               the prototype (spec, read-only)
prisma/                 schema.prisma, migrations/, seed.ts (imports pure modules only)
src/proxy.ts            navigation filter: "has a session?"
src/lib/                pure shared code: dates, format, text (search/sort), labels, permissions, validation
src/lib/schemas/        zod schemas per module
src/domain/             pure business logic, no Prisma: stats, report, documents, print, backup
src/server/             server-only: db, tenant scope, session, audit, document numbering, backup, pdf/
src/server/queries/     reads; every function takes `ctx`
src/server/actions/     server actions ("use server"), one file per module, plus run.ts
src/app/(auth)/         login, signup, invitation, password reset
src/app/(app)/          the modules (/, persoane, procese-verbale, calendar, documente, grupuri, mentiuni, setari)
src/app/pdf/**/route.ts PDF endpoints
src/components/         ui/ (fields, pager, Flash, useActionForm), shell/ (navigation)
tests/                  unit/, integration/, prototype/ (parity harness), stubs/
```

## Conventions (mandatory)

### Tenant isolation (the most important rule)

- Pages, route handlers and actions work with `ctx = { user, db }`.
  - `ctx.db` is the Prisma client scoped to the user's church (`scopeToChurch` in `src/server/tenant-scope.ts`).
  - It adds `churchId` to `where` for reads, updates, deletes and counts, and to `data` for creates.
- `churchId` comes only from `ctx.user.churchId`, never from a form, URL or request body.
- The extension intercepts **top-level operations only**. Two things are **not** scoped:
  - nested writes (`create` or `connect` inside relations);
  - raw SQL (`$queryRaw`, `$executeRaw`).

  Therefore:
  - verify every referenced id explicitly, for example with `assertPersonsInChurch(ctx.db, ids)`;
  - write the `churchId` condition by hand in raw SQL.
- The child tables `MeetingAttendee`, `EventContribution`, `GroupMember` and `PersonRole` have no `churchId`. Reach them only through their parent.
- Use the global `prisma` client (`src/server/db.ts`) only for:
  - authentication, signup, invitations and password reset;
  - the session;
  - the `Church` model, which is not a tenant model;
  - global checks such as a unique e-mail;
  - import;
  - the health check.
- A new church-owned model needs:
  - a `churchId` column with a relation and an index;
  - an entry in `TENANT_MODELS`;
  - a case in `tests/integration/tenant-isolation.test.ts`.

### Authorization

- Pages and route handlers call `const ctx = await requireCtx(permission?)`. Without a session it redirects to the login page; without the permission it calls `forbidden()`.
- Server actions call `const ctx = await actionCtx(permission?)`. It throws `ActionError`, and the form shows the message.
- The permissions (`write`, `admin`, `export`, `audit`) are defined in `src/lib/permissions.ts`.
  - The UI also uses them to hide controls. Hiding a control is not protection: always check on the server.
- `getCurrentUser()` reloads the user from the database on every request: active flag, role, `sessionVersion`. To end all sessions of a user, increment `sessionVersion`.
- A church always keeps at least one active administrator; `src/server/actions/users.ts` enforces this.
- `src/proxy.ts` only redirects visitors without a session; it is not an authorization layer. Public paths are listed in `PUBLIC_PATHS` (`src/auth.config.ts`).

### Server actions and forms

The pattern, as in `src/server/actions/groups-notes.ts`:

```ts
export async function saveXAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const data = parseOrThrow(xSchema, xFormInput(formData));
    savedId = await ctx.db.$transaction(async (tx) => {
      /* write + writeAudit(tx, ctx.user, {...}) */
    });
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  redirect(`/x/${savedId}?salvat=1`);
}
```

- `runFormAction` converts errors into `FormState { ok, message, errors, values }`:
  - `ValidationError` becomes field errors;
  - `ActionError` becomes a message;
  - Prisma P2002 (duplicate) and P2025 (not found) become friendly messages.
  - `redirect()` and `notFound()` pass through unchanged.
- Confirmation toasts: redirect with `?salvat=1`, `?sters=1`, `?inregistrat=1` or `?importat=1`, optionally with `&mesaj=…`. The `Flash` component renders them.
- Client side:
  - Use `const { state, pending, onSubmit } = useActionForm(saveXAction.bind(null, id))` with `<form onSubmit={onSubmit}>`.
  - Buttons with `data-native-submit` and `formAction="/pdf/…"` submit natively (PDF preview).
- Validation:
  - Zod schemas live in `src/lib/schemas/`; they are pure and shared. Helpers are in `src/lib/validation.ts`.
  - Validate route ids with `idSchema`.
  - The `*_FIELDS` constants list the fields tracked by the audit log.

### Audit log

- Call `writeAudit(tx, ctx.user, { entity, entityId, entityLabel, action, fields, before, after })` **inside the same transaction** as the change.
- An UPDATE stores only the changed fields, and nothing when nothing changed.
- `before` and `after` are comparable views that use names instead of ids (for example `groupView`).
- The log is shown by `components/audit-trail.tsx` and on `/setari/jurnal`.

### Dates

- Domain dates are ISO strings `YYYY-MM-DD`; database columns are `@db.Date`.
  - Convert only with `toDbDate` / `fromDbDate` (`src/lib/dates.ts`).
- "Today" is `todayIso()` in `APP_TIME_ZONE`.
  - Never use `new Date()` for calendar logic.
  - Ages are computed from strings (`ageAt`).

### Search and sorting

- `Person.searchText` and `Person.sortKey` are derived columns.
  - Every person write spreads `...personDerived(input)`.
  - Notes use `noteSearchText`.
- Search uses `searchTerms()` with `contains` on `searchText`. The text is diacritic-free, includes phone digits and has a GIN trigram index.
- Sort by `sortKey` (Romanian alphabet, independent of the database collation). In memory, use `compareRo`.
- A new searchable field needs the derivation updated and a backfill migration.
- Lists are paginated on the server and their filters live in the URL. The helpers `hrefWith`, `pageParam`, `stringParam` and `<Pager>` are in `components/ui/pager.tsx`.

### Domain logic and prototype parity

- `src/domain/` is pure: no Prisma, no `server-only`. `src/server/mappers.ts` turns database rows into domain records.
- Three functions are exact ports of the prototype:
  - `computeStats` (`stats.ts`);
  - `buildReportText` (`report.ts`);
  - `generateDocumentText` (`documents.ts`).
- `tests/unit/prototype-parity.test.ts` checks them:
  - it extracts the original prototype code with acorn;
  - it runs that code in `node:vm`;
  - it compares the results with ours on randomized datasets.
- Any intentional behaviour change in these functions needs two updates:
  - the parity test, as a documented deviation;
  - README "Diferențe față de prototip".
- The event types "Nuntă" and "Înmormântare" (`EVENT_TYPE_WEDDING` / `EVENT_TYPE_FUNERAL`) feed the statistics.
- Nomenclatures are arrays on `Church`; `resolveNomen` falls back to `NOMEN_DEFAULTS`.

### PDF

- Steps:
  1. Build a `PrintSpec` in `src/domain/print.ts`. It is pure and testable through `printToText`.
  2. Render it with `renderPdf(spec)` and return `pdfResponse(pdf, pdfFileName(...))`.
  3. Do this in a route handler under `src/app/pdf/**`, guarded by `requireCtx()`.
- The letterhead and the signatures (pastor, secretar) come from `getChurch(ctx)`.
- The fonts are traced into the build only for `/pdf/**` (`outputFileTracingIncludes` in `next.config.ts`).

### Document register

- Allocate numbers in an interactive transaction: first `lockDocumentRegister(tx, churchId, year)` (advisory lock), then `nextFreeNumber`.
- The register year is the year of the document date.
- A unique index `(churchId, anRegistru, nr)` guarantees there are no duplicates.

### Import and export

- The format is the prototype's JSON.
  - `src/domain/backup.ts` does the pure validation.
  - `src/server/backup.ts` does the transactional merge or replace.
- Ids that already belong to another church are remapped. The check uses raw SQL that is deliberately not scoped.
- Documents with a missing or duplicate number are renumbered.
- The request body limit is 20 MB (`next.config.ts`).

### E-mail

- `src/server/email.ts` uses Resend and exports `sendInvitationEmail`, `sendPasswordResetEmail`, `sendNewApplicationEmail` and `sendMinutesEmail`.
  - They never throw. They return `"sent"`, `"disabled"` or `"failed"` (`sendMinutesEmail` also the provider's id or error name).
  - The caller tells the user the outcome and keeps the link visible for manual sending.
- E-mail stays off unless `RESEND_API_KEY` and a valid `APP_URL` are set. Links are built only from `APP_URL`, never from request headers.
- Never log tokens, links or recipients.
  - The tests assert that no token reaches the logs.
  - The tests mock the `resend` package; they must never call the real API.
- The public forgot-password flow is `/am-uitat-parola`:
  - it gives the same answer whether or not the account exists;
  - the lookup, the token and the e-mail run in `after()`;
  - each e-mail address is limited to 3 requests per 15 minutes, in memory (`src/server/rate-limit.ts`).

### Baptism details

- Person and Application have `botezBiserica`, `botezLocalitate`, `botezOficiant` (the old `locBotez` became the locality in the `baptism_details` migration). `baptismSentence()` (`src/lib/baptism.ts`) renders "Botezat la …, în Biserica …, …, de …" without dangling commas.
- The church and the officiant are part of `personDerived` searchText.
- Domain records keep the prototype's `locBotez`, filled from the locality (`src/server/mappers.ts`).
- Export/import: the three fields on members (`src/lib/baptism-backup.ts`), `locBotez` written with the locality; older files import `locBotez` as the locality.

### Membership applications

- Public form `/cerere/<slug>`, under `(auth)`, listed in `PUBLIC_PATHS`. `Church.slug` is unique; `slugify()`/`slugVariant()` in `src/lib/slug.ts` are mirrored by the backfill in the `applications` migration.
- The church comes only from the slug, never from a form field. The row is written through `tenantDb(church.id)`, and an audit entry is written with user "Formular online".
- Anti-abuse: a honeypot field `website`, plus `sharedRateLimiter("applications")` with 5 submissions per hour per IP and church.
- Accepting goes through `savePersonAction` with a hidden `cerere` field. The person and the ACCEPTED application (with `personId`) are written in one transaction.
  - A same-name, same-birth-date person returns `PersonFormState.duplicate`; `fortat=1` saves anyway.
- Export/import: the `applications` collection lives in `src/lib/application-backup.ts`, outside `src/domain`; files without it import unchanged.

### Church roles (funcții)

- `ChurchRole` is the church's nomenclature (tenant model); `PersonRole` links persons to roles, with optional `since`/`until`.
- `DEFAULT_CHURCH_ROLES` (`src/lib/roles.ts`) is created at signup and was backfilled by the `church_roles` migration; keep both in sync.
- Editing the nomenclature (`/setari/functii`) needs `admin`. A role held by anyone cannot be deactivated.
- The person form sends the roles as JSON in the hidden field `functii` (`personRolesSchema`); `assertPersonRoles` checks the ids belong to the church. The audit log stores them as the text field `functii`.
- Export/import: `roles` collection and `functii` (by name) on members, in `src/lib/roles-backup.ts`.

### Meeting attendance

- Each meeting type has a rule (`Church.regulaPrezenta`, `src/lib/attendance.ts`): `TOTI` (members in the record), `COMITET` (holders of an active committee role) or `MANUAL`. Defaults: Adunare generală → TOTI, Comitet and Frați slujitori → COMITET.
- `MeetingAttendee.status` is PRESENT or ABSENT. Anything that lists the persons present must filter on `status: "PRESENT"`.
- On save, `expectedAttendees` (as of the meeting date) minus the persons present become ABSENT rows, and `Meeting.asteptati` stores the expected count. The quorum line uses it, so meetings saved before the rules show no quorum.
- Export/import: `absenti`, `asteptati`, `nr`, `puncte`, `observatii` and `formulaIncheiere` on each meeting (`src/lib/meeting-backup.ts`).

### Minutes (procese-verbale)

- Numbered per year like documents: `lockMeetingRegister` then `nextFreeMeetingNumber` (`src/server/doc-numbering.ts`), unique `(churchId, anRegistru, nr)`. A manual number is checked; meetings saved before numbering have `nr = null` until edited or "Atribuie număr".
- Content: `puncte` (ordered list, sent as JSON in the hidden field `puncte`), `observatii`, `formulaIncheiere`. The old `discutii` / `hotarari` were moved there by the `minutes_numbering` migration (`splitDecisions()` in `src/lib/minutes.ts` mirrors it) and stay empty; never write them.
- The PDF follows `docs/samples/proces-verbal-model.md`; `print.test.ts` compares `printToText` with its example line by line. Change both together.
- Signatures: `MeetingSignature` (no `churchId`, reached through Meeting), one per person present. The pad's PNG is re-encoded by `normalizeSignature()` (sharp, ≤ 600×200 px, ≤ 40 KB), also on import.
- `Meeting.locked`: a closed meeting is read-only. Every meeting write checks it on the server (`ActionError`); only `admin` can reopen it. Signing, deleting a signature, closing and reopening are audited (names, never the image).
- Sending: "Trimite" (`write`, `sendMinutesAction` in `src/server/actions/meeting-send.ts`) e-mails one message to the deduplicated recipients (Pastor/Secretar from `Church.pastorEmail`/`secretarEmail` preselected, attendees with an e-mail, free addresses), the PDF attached (≤ 10 MB). Each send is a `MeetingSend` row (no `churchId`, created through the meeting) and an audit entry; `sharedRateLimiter("minutes-send")` allows 20 sends per church per hour. Without e-mail configured the button is disabled.
- `renderMeetingPdf()` / `meetingPdfFileName()` (`src/server/pdf/meeting.ts`) are shared by the PDF route and the e-mail: `PV-<nr>-<AAAA>-<slug>.pdf`. "Partajează" passes that file to the Web Share API, else downloads it.

### Importing old minutes

- `/procese-verbale/import` (`write`): Word files and scans on one page. `.docx` (≤ 5 MB, ≤ 30 per batch) are read in memory with mammoth (`src/server/minutes-import.ts`) and parsed by `parseMinutesText()` (`src/domain/minutes-parse.ts`, pure; fixtures `docs/samples/*.docx`). Scans go through the extraction below. Nothing is stored.
- `reviewDraft()` matches names (`matchPersonName`): a unique match is an attendee, the rest are "Nepotriviți" with a picker (`resolveImport()` in `src/lib/minutes-import.ts`); unpicked names become guests.
- The review saves through `saveMeetingAction` with the hidden field `import=1`: no redirect (batch "Următorul"), and a taken number falls back to the next free one with a notice.

### Reading documents with Claude (extraction)

- `src/server/extract.ts`: PDF / JPG / PNG (≤ 20 MB, 30 s timeout) sent to the Claude API with a strict JSON schema per kind (`src/lib/schemas/extract.ts`). The answer is validated again with zod and anything off-schema is refused. The model comes from `EXTRACT_MODEL`, default `claude-sonnet-5-5`, with server-side refusal fallback.
- Off unless `ANTHROPIC_API_KEY` is set (`isExtractConfigured()`). Log only the kind, the duration and the token counts, never content. Files are read in memory and never stored.
- 60 extractions per church per day (`sharedRateLimiter("extract")`), and an `EXTRACT` audit entry (file name and size) per extraction.
- Tests pass a mock `ExtractClient`; they must never call the real API.

### Families

- `Family` is a tenant model with a head (`headId`, unique) and members (`Person.familyId`). The old text column is `Person.familieVeche`: kept for one release, then dropped by a later migration. Never write it.
- `pickHead()` / `defaultFamilyName()` (`src/lib/families.ts`) choose the head ("Cap de familie", else the oldest adult man, else the oldest adult) and the name ("Fam. Prenume Nume"). The `families` migration applies the same rule in SQL; keep them in sync.
- Membership changes go through `settleFamily()` (`src/server/families.ts`): an empty family is deleted, and a headless one gets a head. The head of a family with other members changes family only after a new head is chosen on `/familii/[id]`.
- Domain records carry `familyId`. `computeStats` and the blessing certificate use it; the parity tests document both deviations.
- Export/import: `families` collection and `familyId` on members (`src/lib/families-backup.ts`). Members keep the prototype's `familie` text with the family's name. Older files get one family per text.

### Database and migrations

- Never edit an applied migration: Prisma checks its checksum. Add a new migration instead. Example: `note_search` has a wrong backfill, which `note_search_fix` corrects.
- Declare trigram indexes in the schema: `@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)`.
- The seed only recreates the church with id `demo`. Never run it against production.

### Tests

- Unit tests sit next to the code (`src/**/*.test.ts`).
- Parity tests are in `tests/unit` and `tests/prototype`.
- Integration tests are in `tests/integration`: tenant isolation and concurrent document numbering.
- There are no end-to-end tests in the repo yet; see the roadmap.

## Working model

### Branches

- `dev` is the working branch. All work is committed and pushed there.
- `main` is production.
  - Only the owner updates it, with a fast-forward merge from `dev` (`git merge --ff-only dev`).
  - Before each merge, the owner creates a backup of the branch being updated, named `backup-<branch>-<YYYY-MM-DD>` (for example `backup-main-2026-09-29`).
- Claude never commits to `main`, never merges and never rewrites history (no rebase, amend or force-push).
- Corrections are new commits.
- No new pull requests unless the owner asks for one.

### Commits

- One topic per commit.
- The subject is `MARKER: short subject`, in English. `MARKER` is an upper-case tag for the topic, for example `EMAIL-RESEND: send invitations by e-mail`. The body explains what changed and why.
- Run `npm run check` before **every** commit; it must be green. CI runs the same command on `dev`, `main` and pull requests.
- No secrets anywhere: code, docs, commit messages and reports. `.env` and `node_modules` are never committed.

### Language

- Code, identifiers, comments, commit messages and developer docs are in English. Older code still has Romanian comments; do not mass-translate them.
- Everything a user sees is in Romanian with correct diacritics (ș and ț with a comma below). This covers UI text, validation messages, e-mails and PDFs.

### UI rules

- Primary action: a filled button (`btn btn-primary`) with a verb and an icon. At most one per area (card, form or dialog).
- Secondary actions: outlined buttons (`btn`), never filled.
- Selected state: the `--accent` colour, a check mark and bold text.
- Long lists scroll inside their panel instead of stretching the page.
- Touch targets are at least 44 px.
- No technical jargon in the UI: no "token", "API", "server", environment variable names or error codes.
- Mobile-first: check every change at 390 px width and on desktop, in the light and the dark theme.

### Final report

At the end of every run, report in one code block with exactly this structure:

```text
COMMITS (dev, pushed <from>..<to>; main untouched)
  <sha>  MARKER: subject
NPM RUN CHECK (before each commit; last run)
  lint / typecheck / test / build: results, test count
SMOKE TEST
  step → PASS/FAIL with numbers (HTTP status, ms, px)
CHANGED / SKIPPED AND WHY
  - deviations from the prompt with reason
  - new dependencies (justified)
  - what could not be tested here and must be tested manually
  - env vars to set in Render: list, without values
```
