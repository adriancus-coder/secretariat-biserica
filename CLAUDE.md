# Secretariat Biserică: instructions for Claude

Church secretariat web app. It covers the person register, meeting minutes (procese-verbale), a calendar with agapă, the outgoing document register, the annual report (dare de seamă), groups, notes (mențiuni) and settings.

- Multi-church with full data isolation.
- Roles: Administrator / Secretar / Vizualizare.
- User interface in Romanian, mobile-first.
- First production church: Maranata Stavanger (Norway).

- Functional spec: `prototip/secretariat-biserica.html`, the original single-file prototype. **Never edit it**: the parity tests execute its code.
- `README.md`: setup, environment variables, migrations and deployment.
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
- The child tables `MeetingAttendee`, `EventContribution` and `GroupMember` have no `churchId`. Reach them only through their parent.
- Use the global `prisma` client (`src/server/db.ts`) only for:
  - authentication, signup, invitations and password reset;
  - the session;
  - the `Church` model, which is not a tenant model;
  - global checks such as a unique e-mail;
  - import.
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
