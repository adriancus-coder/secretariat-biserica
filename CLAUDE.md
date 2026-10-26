# Secretariat Biserică: instructions for Claude

Church secretariat web app. It covers the person register, meeting minutes (procese-verbale), a calendar with agapă, the outgoing document register, the annual report (dare de seamă), groups, notes (mențiuni) and settings.

- Multi-church with full data isolation.
- Roles: Administrator / Secretar / Vizualizare / Rugăciune (only the weekly prayer page and its own account).
- User interface in Romanian, mobile-first.
- First production church: Maranata Stavanger (Norway).

- Functional spec: `prototip/secretariat-biserica.html`, the original single-file prototype. **Never edit it**: the parity tests execute its code.
- `README.md`: setup, environment variables, migrations and deployment.
- Deployment: `render.yaml` (Render Blueprint) with the health check `/api/health`. The steps are in README, "Deploy on Render".
  - Production: https://secretariat-biserica.onrender.com. The Render service follows `dev`, so every push to `dev` goes live.
  - In production, `APP_URL` and `AUTH_URL` both hold the public address. Behind Render's proxy, Next.js only sees `https://localhost:10000`.
- `docs/ROADMAP.md`: decisions and priorities.
- `docs/SECURITY.md`: threat model, what is hashed or encrypted, headers, incident steps, backup policy.

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
| `npm run audit:check` | `npm audit` gate used by CI: fails on high/critical findings not in `audit-allowlist.json` (entries expire) |
| `npm test` | Vitest, unit and integration. Integration tests need `TEST_DATABASE_URL`, and that database is truncated on every run. |
| `npm run db:deploy` | Apply the existing migrations |
| `npm run db:migrate -- --name <name>` | Create a migration after a schema change (development only) |
| `npm run db:seed` | Load the demo church: `admin@demo.ro`, `secretar@demo.ro`, `vizualizare@demo.ro`, `rugaciune@demo.ro`, password `demo1234` |

Never run `prisma migrate reset` / `npm run db:reset` or any other destructive database command unless the owner explicitly asks. Prisma itself refuses resets started by an AI agent without the user's consent; do not bypass that.

## Stack notes (newer than most training data)

- **Next.js 16.4** (App Router, Turbopack):
  - `src/proxy.ts` replaces middleware. It also sets the per-request CSP nonce (`src/lib/csp.ts`), so every page renders dynamically; never add inline `<script>` without the `x-nonce` header's nonce.
  - `params` and `searchParams` are Promises.
  - The global types `PageProps<"/route">` and `RouteContext<"/route">` come from `next typegen`, which runs inside `npm run typecheck`.
  - `forbidden()` relies on `experimental.authInterrupts`.
- **React 19.2**: `<form action={fn}>` resets the form after every submit, including after a validation error. Forms whose input must survive errors use `useActionForm`.
- **Prisma 7.10**:
  - The `prisma-client` generator writes to `src/generated/prisma`. That directory is gitignored and generated on `npm install`.
  - Import from `@/generated/prisma/client`.
  - Configuration is in `prisma.config.ts`, with the driver adapter `@prisma/adapter-pg`.
  - The package is ESM (`"type": "module"`).
- **Auth.js v5 beta** (`next-auth@5.0.0-beta.32`): Credentials provider with 24-hour sliding JWT sessions (renewed at most once an hour).
  - `src/auth.config.ts` has no database access; the proxy uses it.
  - `src/auth.ts` adds the database-backed provider. It accepts only a verified login challenge (see "Two-step authentication"), never an e-mail and password directly.
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
- The child tables `MeetingAttendee`, `EventContribution`, `GroupMember`, `PersonRole`, `MeetingSignature` and `MeetingSend` have no `churchId`. Reach them only through their parent.
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
- The permissions (`read`, `account`, `write`, `admin`, `export`, `audit`, `rugaciune`, …) are defined in `src/lib/permissions.ts`.
  - `requireCtx()` / `actionCtx()` without an argument ask for `read`: every role except RUGACIUNE. The "Rugăciune" role has only `account` (Cont: password, two-step, passkeys, notifications; `requireUser()` / `actionCtx("account")`) and `rugaciune` (`/rugaciune`, also Secretar and Admin; not Vizualizare); it is never a pastor (`setPastorAction` refuses, a role change to it drops the flag), gets no badges, no saved signature, and `/` sends it to `/rugaciune`. The navigation is filtered per permission (`navItemsFor`, `NavItem.permission`).
  - `tests/unit/prayer-role-access.test.ts` reads every page, route handler and server action and fails when one does not refuse that role; a new public or account route/action goes on its allowlist on purpose.
  - The UI also uses them to hide controls. Hiding a control is not protection: always check on the server.
- `getCurrentUser()` reloads the user from the database on every request: active flag, role, `sessionVersion`. To end all sessions of a user, increment `sessionVersion` ("Deconectează-te de pe toate dispozitivele" in Cont; per user for the admin in Setări → Utilizatori).
- Sessions: JWT, 24 hours, sliding (renewed at most once an hour while in use).
- Per-IP limits in memory (`src/server/ip-limits.ts`): login 10 / 15 min, signup 5 / h, forgot password 5 / h, 2FA code 10 / 15 min. The IP (`ipFromHeaders`, `src/lib/client-ip.ts`) is read only when `AUTH_TRUST_HOST=true`: `cf-connecting-ip`, `true-client-ip`, else the LAST `X-Forwarded-For` entry (added by the trusted proxy; earlier entries are client-controlled), validated as an IP literal; otherwise all visitors share one counter ("necunoscut"). Server actions answer with a Romanian message; a direct post to `/api/auth/callback/credentials` gets HTTP 429.
- No account enumeration: `checkPassword` gives the same "invalid" answer and one scrypt check for an unknown address, a wrong password and a locked account; only the right password on a locked account gets the lock message. Signup with a registered address answers "Dacă adresa poate fi folosită, veți primi un e-mail" (`sendSignupExistsEmail` to that account). The 2FA e-mail code is only in the body. 2FA inputs go through `src/lib/schemas/two-factor.ts` (bounded length).
- New passwords (`src/server/password-policy.ts`): at least 10 characters, not in the bundled top-10k list (`common-passwords.ts`, server-only), without the e-mail or the name. Existing passwords keep working.
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

### Address (Norwegian format)

- `Person`, `Family`, `Application` and `Church` have `adresa` (street and number), `codPostal` (exactly 4 digits or empty, `postalCode` in `src/lib/validation.ts`) and `localitate`. The data-update proposal has them as `SELF_FIELDS` (review shows "Cod poștal: — → 4323").
- Showing an address always goes through `formatAddress()` (`src/lib/address.ts`: "Ulveveien 20, 4323 Sandnes", skips empty parts, never two spaces). Never join the parts by hand (`tests/unit/address-format.test.ts` scans `src/`). `ChurchInfo` carries the three fields; letterhead, documents and discipline convocations format them.
- `splitLegacyAddress()` / `addressFromInput()` read an old single line ("<street>[,] <4 digits> <locality>"): JSON import, seed. The migration `address_format` applies the same rule in SQL (idempotent, counts only; `tests/integration/address-migration.test.ts` re-runs its data block). Addresses without a postal code are listed on `/de-verificat` ("Adresa nu are cod poștal", `addressReviewWhere`, counted in the nav badge).
- Forms use `AddressFields` (`src/components/ui/address-fields.tsx`): street, then code (numeric, 4 digits) and locality on one row (`.addr-row`); the locality fills in from `src/lib/postal-codes-no.json` (Bring Postnummerregister, NLOD; loaded on first use) and a locality the user typed is not overwritten.
- Contact restriction after an exit (`contactRestricted`) covers all three fields. Export columns: `adresa`, `codPostal`, `localitate`, `adresaCompleta`. Backup keeps the fields separate.

### Dates

- Domain dates are ISO strings `YYYY-MM-DD`; database columns are `@db.Date`.
  - Convert only with `toDbDate` / `fromDbDate` (`src/lib/dates.ts`).
- "Today" is `todayIso()` in `APP_TIME_ZONE`.
  - Never use `new Date()` for calendar logic.
  - Ages are computed from strings (`ageAt`).
- Baptism: `dataBotez` (full date) and `botezAn` (year). A full date also fills `botezAn` (`baptismYearOf`); a year alone leaves `dataBotez` null. Statistics count a baptism by its year; texts say "în anul <an>" when there is no date.

### Search and sorting

- `Person.searchText` and `Person.sortKey` are derived columns.
  - Every person write spreads `...personDerived(input)`.
  - Notes use `noteSearchText`.
- Search uses `searchTerms()` with `contains` on `searchText`. The text is diacritic-free, includes phone digits and has a GIN trigram index.
- Sort by `sortKey` (Romanian alphabet, independent of the database collation). In memory, use `compareRo`.
- A new searchable field needs the derivation updated and a backfill migration.
- Lists are paginated on the server and their filters live in the URL. The helpers `hrefWith`, `pageParam`, `stringParam` and `<Pager>` are in `components/ui/pager.tsx`.

### Statute of the Cultul Creștin Penticostal (statuses)

- References in code and README are written "Statut art. N".
- `PersonStatus` (Statut art. 28): MEMBRU, APARTINATOR (unbaptised), PRIETEN ("Prieten al casei Domnului (nebotezat)"; `STATUS_LABEL_SHORT` "Prieten (nebotezat)" only on list / member row tags; counted `PRIETENI_LABEL` / `PRIETENI_TITLE` "prieteni ai casei Domnului (nebotezați)"; the JSON backup writes the prototype's "Prieten" (`PROTOTYPE_STATUS_LABEL`, like "Reprimire") and the import accepts "Prieten", "Prieten al casei Domnului" and the new label via `statusForLabel()`; never written by hand outside `src/lib/labels.ts`, `status-label.test.ts` scans `src/`), BOTEZAT_FARA_TRANSFER ("Botezat, fără calitate de membru"), FOST_MEMBRU. There is no "Copil" status: a minor is computed from the birth date (no birth date = not a minor). `STATUS_HINT` (`src/lib/labels.ts`) explains each on the person form; an aparținător with a baptism is refused (`personDateErrors`), a member without one gets a warning.
- Aparținător kind, derived, never stored: a) minor, unbaptised, in a family whose head or a member with rudenie in `BELIEVER_RELATIONS` (head, spouse, parent) is MEMBRU; b) the others. `computeStats` exposes `apartA` / `apartB` / `botezatiFara`; `apartinatorKind()` (`src/lib/apartinator.ts`) applies the same rule on the person page. The report's persons block follows art. 28 (documented in the parity test, `statuteBlock`, and README).
- Migration `statute_statuses` mapped Copil and baptised Aparținător (`Person.statutAjustat` + a note line; Setări → Date "Statute ajustate", hidden by an admin with `dismissStatusAdjustmentsAction`). Older backup files go through `legacyStatus()` with the same rules.
- Applications: Botez → member from the baptism date, Transfer / Cerere → from the approval date, Altul → Prieten (or Aparținător, chosen on the form).
- Register fields (Statut art. 14, 20–24): `dataCasatoriei`, `numeTata` / `numeMama` (parents not in the register; in `personDerived` searchText and in the blessing certificate when the family has no parents — documented deviation), `intrareMeetingId` (approving minutes of a transfer / reabilitare; the form fills `dataMembru` from it or from the baptism date when empty), `iesireMeetingId` (required for EXCLUDERE), `dataCerereRetragere` (required for RETRAGERE), TRANSFER exit requires `bisericaDestinatie` (`personDateErrors`). Meeting ids are checked against the church in `savePersonAction`. REPRIMIRE is shown as "Reabilitare spirituală"; the JSON backup keeps the prototype's "Reprimire" (`PROTOTYPE_ENTRY_LABEL`) and accepts both. A death reads "Decedat(ă) la …".
- Temporary absence (art. 23 alin. 4–5): `plecatDin` / `plecatUnde`; categories `plecati-temporar`, `plecati-3-luni`, `plecati-6-luni` (`monthsBefore`), an Acasă notice linking to them, "S-a întors" on the person page (`returnedAction`, audited). Backup: `src/lib/register-backup.ts` (`intrarePv` / `iesirePv` remapped after the meetings).

### Unmarried flag

- `Person.necasatorit` ("Necăsătorit(ă)", `src/lib/marital.ts`, pure): distinguishes "not married" from "date missing". Never together with `dataCasatoriei` (refused by `personSchema` / `selfSchema`; the person form disables and empties the date when ticked, a typed date unticks it). A minor (under 18 by the birth date) never has it: not shown, not asked, a submitted flag is dropped (`normalizeUnmarried`). The label follows the gender (`unmarriedLabel`: Necăsătorit / Necăsătorită / Necăsătorit(ă)).
- Data-update campaign: same checkbox next to the date; `selfChanges` shows one row "Data căsătoriei: 11 iun 2005 → Necăsătorit(ă)" and `applyDecision` writes date and flag together only when that row is accepted. Also in the person page, audit labels, the art. 15 copy, the person export (the "Data căsătoriei" column) and the JSON backup (`necasatorit` on members). Not used for families.

### Pastor capacity (Statut art. 38–39)

- `User.isPastor` (+ optional `pastorTitlu`: pastor coordonator / asistent) is independent of the role, so a pastor can also be an administrator; set only by an ADMIN in Setări → Utilizatori ("Pastor al bisericii", `setPastorAction`, audited). Several pastors are allowed. `CurrentUser` carries both.
- `src/lib/permissions.ts` functions take a `Who` (a bare role, or `{ role, isPastor }`); pass `ctx.user`, not `ctx.user.role`, wherever the pastor flag matters: `pastor` and `pastoral` = isPastor only (not ADMIN), `disciplina` = isPastor, or ADMIN / SECRETAR with `accesDisciplina` (DISCIPLINE-ACCESS; pass the whole user). `requireCtx` / `actionCtx` already pass the user.
- The header shows "Pastor" for pastors; Organizația → Pastor, when empty, defaults to the active pastor users' names (`getChurch`).

### Signatures on documents

- Cont → "Semnătura mea" (`my-signature-card.tsx`): draw on the shared pad (`src/components/signature-pad.tsx`) or upload a PNG; normalised like meeting signatures (`normalizeSignature`), stored as `User.signaturePng`. Saving / replacing needs `verifyUserPresence` (purpose `semnatura-salvata`), or the password for a user without a passkey; audited (SECURITY) without the image.
- `DocumentSignature` (no churchId; reached through the document found with `ctx.db`): role PASTOR | SECRETAR (one each), userId, name, imagePng, mode SALVATA | UNICA, passkeyCredentialId, signedAt. `src/server/document-signatures.ts`: `signatureImage()` — UNICA = drawn now for this document only; SALVATA = the saved image, ALWAYS after a fresh assertion for purpose `semnatura:<documentId>` (refused otherwise, and refused when `freshSignatureRequired`); `writeDocumentSignature()` audits who, how and when (never the image). Actions in `src/server/actions/document-signatures.ts` (`src/server/actions/signatures.ts` is the minutes' signatures).
- Setări → "Semnătura se desenează de fiecare dată" (`Church.semnaturaUnica` "" | TOATE | TIPURI + `semnaturaUnicaTipuri`): the saved option is hidden for those types and refused on the server.
- PDF / Word: the `signatures` block cells take `image` and `note` ("semnat la <data, ora>" + " · confirmat pe dispozitivul titularului" for SALVATA, `signatureNote()` in `src/lib/signatures.ts`); `documentPrint({ signatures })`, loaded by the routes with `printSignatures()`.

### Document approval (pastor)

- `Document.stare` CIORNA | DE_SEMNAT | APROBAT | RESPINS (`DOCUMENT_STATE_LABEL`), `trimisLaSemnatLa`, `aprobatDeUserId`, `aprobatLa`, `motivRespingere`. Every document type with a pastor signature needs approval. The `document_approval` migration marked existing documents APROBAT (without signatures). The approval applies only while the church has an active pastor user (`hasActivePastor`, `src/server/pastor-approval.ts`): without one new documents are saved APROBAT, `getDocument` / `listDocuments` treat every document as APROBAT, the approval card is hidden and the secretary signs at any time (an edit still removes the signatures).
- Secretary: saves a CIORNA, signs the secretary place (`signDocumentAction(id, "SECRETAR")`), "Trimite pastorului spre semnare" (`sendToPastorAction`: DE_SEMNAT, e-mail to the pastor users with a generic text and the link, `sendDocumentApprovalEmail`). Pastor: "De semnat" (`/documente/de-semnat`, permission `pastor`; badge on "Documente" via `pendingBadges(user)` and on Acasă), "Aprobă și semnează" (`approveDocumentAction`: fresh drawing or saved signature + device unlock, then APROBAT, `aprobatLa`), "Respinge" with a reason (`rejectDocumentAction`: RESPINS; the secretary who sent it is told by e-mail). The pastor place is never signed through `signDocumentAction`.
- Editing an APROBAT document (any change) makes it CIORNA again and removes both signatures (`resetApproval` in `src/server/actions/documents.ts`, audited `stare` / `semnaturi`).
- Not approved: PDF and Word carry `DRAFT_WATERMARK` "CIORNĂ — neaprobat" (PDF diagonal on every page; Word in the page header), never the pastor's signature, and a "CIORNA-" file name (`documentSpec`, `documentFileBase`); the page says "Documentul nu este încă aprobat de pastor".
- Export/import: `stare` (+ `motivRespingere`) only on documents not approved (`exportedState`, `src/lib/document-backup.ts`); a sent one comes back as CIORNA; an absent state imports as APROBAT; signatures are never exported.

### Pastor's final word on entries and exits (Statut art. 23 alin. 3)

- Applies while the church has an active pastor user (`hasActivePastor`); otherwise everything works as before.
- Applications: `ApplicationStatus` PENDING → PROPUSA → ACCEPTED / REJECTED. The secretary's "Propune acceptarea" (`/persoane/nou?cerere=…`, the same person form, optional committee minutes in "Procesul-verbal al intrării") goes through `savePersonAction`, which, for a non-pastor, stores the form on the application (`propunere` JSON via `formEntries()`, `propusLa`, `propusDeId`; `proposeApplication()` in `src/server/pastor-proposals.ts`) instead of creating the person. The pastor (any role) decides on `/cereri/[id]`: "Aprobă primirea" (`approveApplicationAction`: the stored form replayed through `savePersonAction` with `cerere`, `entriesFormData()`), "Verifică și modifică" (the form prefilled from the proposal) or "Respinge". Write roles reject only PENDING; PROPUSA only a pastor. Export: PROPUSA goes out as PENDING, the proposal is not exported.
- Reabilitare spirituală entries and Excludere exits: a non-pastor's save where `proposalKind()` (`src/lib/person-proposal.ts`) finds a new REPRIMIRE entry or EXCLUDERE exit is stored as a `PersonProposal` (tenant model; kind, status PROPUSA / ACCEPTED / REJECTED, `formular` JSON, personId or null for a new person; contact data the proposer could not see are filled from the register). The edit form continues from a waiting proposal; a plain save withdraws it. The pastor confirms on `/cereri/propuneri/[id]` (`approveProposalAction`, replay with `propunere`; `settleProposal()` in the save's transaction) or rejects with a reason (`rejectProposalAction`). An applied EXCLUDERE disciplinary measure is set only by a pastor. Not exported; anonymising deletes the person's proposals and the application's `propunere`.
- Badges: "/cereri" counts PENDING for write roles plus PROPUSA applications and proposals for pastors (`pendingBadges(user)`); the "La pastor" tab lists both.

### Pastoral notes (Statut art. 39 alin. 3)

- `PastoralNote` (tenant model: personId, `textEnc`, createdByUserId, timestamps). Permission `pastoral` (isPastor) only — never ADMIN by role — on the server in every read and write, plus the step-up (`hasStepUp`). Never add notes to an export, the JSON backup, the art. 15 copy, a category, search (`searchText`), a list, a count for non-pastors, an audit diff or an error message.
- Text ≤ 10 000 characters (`pastoralNoteSchema`), encrypted with `seal()` / `unseal()` (`src/server/secret-box.ts`, AES-256-GCM, HKDF from `AUTH_SECRET`, purpose `pastoral-note-v1`); `decryptNote()` returns null for an unreadable one (shown as such). `scripts/reencrypt-secrets.ts` (`npm run secrets:reencrypt`, `OLD_AUTH_SECRET` + `AUTH_SECRET`, `--apply`) re-encrypts notes and TOTP secrets before a rotation (docs/SECURITY.md).
- Person page card "Note pastorale" (`pastoral-notes-card.tsx`; behind `StepUpGate` until confirmed): every pastor sees all notes; each changes / deletes only their own (`src/server/actions/pastoral-notes.ts`). Audit entity PASTORAL with only `observatie` ("notă pastorală adăugată / modificată / ștearsă"), entityId = the person; `/setari/jurnal` hides PASTORAL from non-pastors.
- `/pdf/note-pastorale[?persoana=]` (`pastoral`, step-up, `pastoralNotesPrint`): audited with the count only. Anonymising deletes the notes and blanks their log entries; deleting the person cascades.

### Acasă for pastors

- `PastorDashboard` (`src/components/pastor-dashboard.tsx`) at the top of Acasă for `permissions.pastor`: Documente de semnat, Cereri de aprobat (PROPUSA applications + proposals), Măsuri disciplinare deschise (with the next appeal deadline; opens `/disciplina`, `disciplina` + step-up), Plecați de peste 3 / 6 luni, Aniversări (BIRTHDAY consent only; `#aniversari`), Mandatul comitetului, Adunarea Generală of the year. Texts in `src/lib/pastor-dashboard.ts` (pure, tested). For pastors the cards replace the separate Acasă notices on the same subjects.

### Installed app (PWA)

- `src/app/manifest.ts` (standalone, navy / paper, shortcuts Persoane, Ședință nouă, De semnat), icons in `public/icons/` (PNG committed; regenerate from `icon.svg` with `node scripts/build-icons.mjs`), Apple meta in the root layout (`appleWebApp`).
- `public/sw.js` (plain JS, registered by `PwaRegister` in production only, as `/sw.js?v=<NEXT_PUBLIC_SW_VERSION>` = commit): only `/_next/static/**`, `/icons/**` and `/offline.html` are cached (cache-first, cache `static-<version>`, older ones deleted on activate); everything else is network only, a failed navigation shows `public/offline.html`. Never add a route to the cache: `tests/unit/service-worker.test.ts` replays pages, PDFs, API routes, server actions and public forms and asserts nothing is stored. `sw.js` and `offline.html` are excluded from the proxy matcher.
- "Ieșire din cont" is a plain form POST to `/deconectat` (route handler: signOut, 303, `Clear-Site-Data: "cache"`); the `(auth)` layout posts `clear-private` to the worker. Update: "O versiune nouă este disponibilă — Actualizează" (skip-waiting, reload only after that click). `InstallApp` (Mai mult, Cont): `beforeinstallprompt` (captured early in `pwa-store.ts`) or the iPhone steps; hidden when standalone.

### Push notifications

- Web Push with VAPID (`web-push`; `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); without all three `isPushConfigured()` is false and Cont → Notificări is hidden. `PushSubscription` (no churchId, reached through the user; `userAgent` keeps only `deviceLabel()`), `User.pushOff` (types turned off).
- Types and texts in `src/lib/push.ts` (pure, tested): the payload is only `{ title, url, tag, badge }` — never a name or any personal data; `pushTypesFor()` sends each type only to users who can act on it (pastors: documents to sign, proposals; write roles: decided documents, new applications, campaign answers; both: reminders). `notifyChurch(churchId, type, { userIds })` (`src/server/push.ts`, never throws, call it in `after()`); at most one push per user and type per 5 minutes (`PushCoalescer`, in memory); 404 / 410 delete the subscription, other failures are counted and audited (SECURITY, status only).
- Events: `sendToPastorAction` → DOCUMENT_SIGN; approve / reject → DOCUMENT_DECIDED to the sender; a public application → APPLICATION; `proposeApplication` / `proposeForPastor` → PROPOSAL. Digests from `src/instrumentation.ts` every 15 minutes (`runPushDigests`): CAMPAIGN daily, REMINDER weekly, claimed through `Church.pushDailyAt` / `pushWeeklyAt`.
- `public/sw.js` shows the notification (only addresses inside the app are opened) and sets the app badge; `AppBadge` in the app layout sets it on every page load from `pendingBadges`.

### Weekly prayer for families

- Each week a person designated by the committee announces on the church's WhatsApp group the family the church prays for. `/rugaciune` (permission `rugaciune`: the RUGACIUNE role, Secretar, Admin) shows "Familia săptămânii" and nothing else from the register: no search, no list, no contact data.
- `src/lib/prayer.ts` (pure, tested): in the rotation = a family (or a person without a family, key `p:<id>`) with at least one active adult (MEMBRU, APARTINATOR, BOTEZAT_FARA_TRANSFER, PRIETEN; no exit — deaths included —, not anonymised; no birth date = adult) and no `prayerOptOut`. Order: never announced first, then the oldest `PrayerWeek`, then alphabetically by the shown name. No other exception. Shown as "Familia <surname of the head>: <first names of the head and spouse>" (`PRAYER_PARENT_RELATIONS`; else the active adults), plus ", cu copiii …" (the other active members) only with `prayerIncludeChildren`.
- `src/server/queries/prayer.ts` reads only `PRAYER_MEMBER_SELECT` / `PRAYER_FAMILY_SELECT` / `PRAYER_PERSON_SELECT` (names, status, exit, birth date only to tell minors, relation; `tests/integration/prayer.test.ts` checks the selects and the page data). The page gets labels and keys only.
- `PrayerWeek` (tenant model; familyId or personId, both SetNull; `weekStart` = Monday, unique per church). "Marchează ca anunțată" (`markPrayerWeekAction`, re-checks the unit is in the rotation), "Anulează" (this week only), "Sari peste" (`?sari=n`, nothing stored), "Copiază mesajul". Audit entity PRAYER with the week only — never the family's name; copying logs only that it was copied. History: the last 12 weeks; a unit that objected since shows "Familie care a cerut să nu mai fie pomenită".
- Who the message names (`prayerParts`, pure, tested): the head and every Soț / Soție (always parents, even with a wrong birth date); with a married head (`dataCasatoriei`) and no Soț / Soție, the single adult without a child's relation (and not "Părinte") is taken as the spouse; children = a child's relation (`PRAYER_CHILD_RELATIONS`: Fiu, Fiică, Copil, Nepot, Nepoată) AND a minor or no birth date. Nobody else is a child ("copilul lor" never comes from an adult or a member without a relation). `familyRelationIssues()` lists why a family needs checking (member without a relation, a married adult with a child's relation, Soț / Soție under 18, married head without a spouse, two spouses): De verificat → "Familii cu rudenii de verificat" (`familiesToReview()`, `src/server/queries/family-review.ts`, `write`, counted in the badge; each row opens the family); on /rugaciune the secretariat sees "Datele familiei trebuie verificate înainte de trimitere" with the family's link, the Rugăciune role only "Verificați textul înainte de trimitere" (`PrayerPageData.review`, no reason, no data). Nothing is changed automatically.
- The message (`src/lib/prayer-message.ts`, pure, tested; `prayerMessageFor()` runs on the server in `loadPrayerPage`, so the page receives only the finished text): two templates, `Church.prayerMessage` (families: `{parinti}` = the head and spouse by their register names, the surname written once when shared; `{copii}` = the minors: with consent " și pentru micuțul / micuța X" (under 13), " și pentru fiul / fiica lor, X" (13–17), " și pentru copiii lor, A, B și C", " și pentru copilul lor, X" without gender or birth date; without consent " și pentru copilul / copiii lor" (a single parent: ei / lui); adult children never) and `Church.prayerMessagePerson` (`{persoana}` = "fratele / sora / fratele/sora <Nume Prenume>", `{pe}` = să-l / s-o, `{ii}` = să-i); `{familia}` (the short label) still works. "" = `DEFAULT_FAMILY_MESSAGE` / `DEFAULT_PERSON_MESSAGE`; the `prayer_message_natural` migration moved churches still on the first default to "". `templateError()` on the server: {parinti} or {familia} for families, {persoana} for a person, no other variable. Admin edits both in Setări with live previews on a real family and person (`prayerSamples`). Never an age, a date, a phone, an address or a status; no double spaces or " ,".
- "Toate familiile" (`prayer-overview.tsx`, under the week's card): the rotation in its order from the same `loadPrayerPage()` (`overview`: key, the shown label — children's first names only with consent —, the Monday of the last announcement, the order; never contact data, birth dates, status or review reasons), a `DataTable` from 600 px and a list on phones, a search that ignores diacritics (`normalizeSearch`), "Urmează" / "a 2-a" … (`rotationOrderLabel`). "Alege săptămâna aceasta" (`choosePrayerFamilyAction`, `rugaciune`, audited PRAYER "familie aleasă manual pentru săptămâna …" without the name) then `/rugaciune?alege=<key>`: a unit of the rotation replaces the proposed one and its message is built for it; nothing is marked. Beside the 12 weeks: "X familii în rotație · Y pomenite anul acesta · un ciclu complet durează aproximativ Z săptămâni" (`summary`).
- Sending (`prayer-week-card.tsx`): the message is an editable textarea (≤ `PRAYER_SHARE_MAX` = 1000, counter, "Revino la model", `PRAYER_SHARE_HINT`), prefilled from the model. The edited text never reaches the server or the audit log: it stays only in `sessionStorage` (`rugaciune-mesaj`, per week and family, try/catch; cleared on marking or when the family changes). "Trimite pe WhatsApp" = `whatsappUrl()` (`https://wa.me/?text=<encodeURIComponent>`, no number), "Partajează" = `navigator.share({ text })` only where it exists (AbortError is silent), "Copiază mesajul" with a select-and-copy fallback for Safari. Back in the app: "Ați trimis mesajul? Marchează ca anunțată" (never automatic). `prayerSharedAction(channel)` audits only "PRAYER shared: whatsapp|share|copy". The CSP does not restrict top-level navigation, so the wa.me link needs no change (`csp.test.ts`). Setări shows a live preview of the model with an example family.
- `Family.prayerOptOut` / `prayerIncludeChildren` / `prayerChangedAt` / `prayerSource` (CAMPANIE | HARTIE | SECRETARIAT); the same four on `Person` for persons without a family (a family's own fields apply to its members). Edited on the family page ("Rugăciunea săptămânală", write roles; for a person without a family on the person page), `setPrayerPrefsAction`, audited FAMILY / PERSON. In the art. 15 copy (choice, last change, weeks announced). Anonymising deletes the person's weeks.
- Campaign: the personal link of the head, a spouse or an adult without a family (`answersForFamily`) shows "Rugăciunea săptămânală pentru familii" apart from the four consents: "Nu doresc ca familia mea să fie pomenită pe grupul bisericii" (objection) and "Copiii pot fi pomeniți cu numele" (consent; `PRAYER_CHILDREN_LABEL` / `PRAYER_CHILDREN_HELP` "Altfel, mesajul spune doar „și pentru copiii lor”.", the same on the family card and the paper form), both unticked by default (`rugaciuneSectiune` / `rugaciuneNepomenita` / `rugaciuneCopii` → `proposal.prayer`; the general link never asks). De verificat shows them as rows `r:optOut` / `r:includeChildren`; `applyDecision` applies the chosen ones to the family (`applyPrayer`, source CAMPANIE), the more restrictive answer winning against the other parent's answers approved in the same campaign (`restrictivePrayer`; stored as `prayerApplied` on the submission). The blank paper form `/pdf/formular-acorduri` (`write`, `consentFormPrint()`) has the four consents and the same two rows; paper prayer answers are entered on the family page (source HARTIE).
- Push PRAYER "Familia săptămânii este pregătită." to the `rugaciune` users, Monday from 08:00 (`APP_TIME_ZONE`), claimed per church with `Church.pushPrayerWeek`.

### Kinship (rude și neamuri)

- `PersonParent` (tenant model: `parentId`, `childId`, `source` FAMILIE | MANUAL | CAMPANIE, `createdById`; unique pair; `kinship` migration) is the only stored kinship. Spouses stay defined by the family (head + Soț / Soție, `familyParents()` in `src/lib/kinship.ts`, shared with `prayerParts`); never add another kind of link.
- Rules on the server (`parentLinkError(links, parent, child, born)`): never oneself, no duplicate, not between siblings (a parent in common: "Persoanele sunt frați; nu pot fi părinte și copil."), the parent at least 12 years older when both birth dates are known (`MIN_PARENT_AGE_GAP`, "Diferența de vârstă e prea mică."), at most two parents (`MAX_PARENTS`), no cycle; both persons found through `ctx.db` (same church), never an anonymised one. The same checks apply to manual links and to the import.
- Links from families (`familyLinks()` / `linkParents()`, KINSHIP-FIX-SIBLINGS): parents are ONLY the head (the family's head, or the member with rudenie "Cap de familie") and Soț / Soție, whatever their age — never "all adults" and never a member with a child's relation (an adult Fiu chosen as the family's head stays a son); without Soț / Soție, the head alone; more than two → the "Cap de familie" (or the head) alone. The graph's couples use the same rule. (The weekly prayer keeps its own inferred-spouse rule, `familyParents()`.)
- Actions in `src/server/actions/kinship.ts`: `addKinLinkAction(personId, "parinte" | "copil", otherId)` (the card uses only "parinte") / `removeKinLinkAction` (`write`, audited PERSON on both persons with both names: "legătură adăugată / ștearsă: X este părintele lui Y"); `checkKinLinksAction` (`admin`, De verificat → "Verifică din nou tot registrul", idempotent, marks `Church.kinshipCheckedAt`, shown as "Ultima verificare a întregului registru: …").
- Automatic check (KINSHIP-AUTO, `src/server/kinship-sync.ts`): `syncKinship(tx, user, scope)` runs in the change's transaction after every change that touches a family — person save / create / delete (family, relation, birth date), family save (head), move, add members, dissolve (also the automatic families'), recalculated heads, campaign approval (`applyDecision`), JSON import (`"all"`). The scope is the given persons plus every member of their families and of the given families. Deleted without asking (`autoDeletable`): FAMILIE links that break the rules (`linkViolations()`: siblings, age gap, or — in the common family — a parent who is not the head or Soț / Soție) or that the families no longer support (`staleFamilyLinks()`: the child has parents in its current family and this one is not among them, or both share a family that no longer suggests the link; a child who left without new parents there — an adult heading his own family, a dissolved family — keeps them), and NUME_PARINTI links whose name the file no longer carries; then the families' missing links are added, repeated until nothing changes. MANUAL / CAMPANIE / NUME_PARINTI links that break the rules are never deleted, they are listed in De verificat → "Legături de rudenie de verificat" (`manualLinksToReview()`, `write`, counted in the badge, both persons linked, "Șterge legătura"). Audit SETTINGS "Legături de rudenie" with counts only, when something changed. The first full run per church (`runFirstKinshipCheck`): the first page a write user loads, in `after()` from the app layout, claimed with `Church.kinshipCheckedAt` (a failure releases it), audited with the counts. De verificat shows the "Rudenie" block to administrators even when empty ("Nimic de verificat la rudenie."); nothing about kinship is left in Setări → Date.
- "Rude în biserică" shows the link's source next to parents and children for write roles ("din familie" / "adăugată manual" / "din campanie" / "după numele părinților", `KIN_SOURCE_LABEL`).
- Siblings (KINSHIP-CARD-SIBLINGS): children are read only on the card (added through the family, "+ Membru de familie"; an adult child shows with his own family; empty: "Copiii se adaugă din familie, cu «+ Membru de familie»."). "Frați și surori" is always shown, with "+ Adaugă frate / soră" (write roles; `pickSibling`: already siblings and the person's lineage disabled with the reason). `siblingPlan()` (`src/lib/kinship-siblings.ts`, pure, tested) and `addSiblingAction(personId, otherId, confirm, names?)` (the plan again on the server, nothing written before "Confirmă"): a) a parent in common → "Sunt deja frați."; b) one has parents in the register and the other none → "Leagă pe X ca fiu/fiică a lui …?", the same parents; both with different parents → refused; c) no parent in the register → parents outside the register by `numeTata` / `numeMama`: the names of one file are used for both and written where missing, different names → "Numele părinților diferă pe cele două fișe. Corectați-le întâi.", no names anywhere → "Numele tatălui" / "Numele mamei" asked once and written on both files ("Se completează pe fișele lui X și Y"), each field audited, `personDerived` recomputed; a parent outside the register already linked to one of them is reused (the third brother). Links MANUAL through `parentLinkError`; audited "legătură de frați: X și Y" on both. "Șterge legătura de frate" (`removeSiblingLinkAction`, rows where `siblingLinksToRemove()` finds a MANUAL / NUME_PARINTI link to a common parent): removes this person's such links to the common parents, or else the sibling's; never the names on the files, never a family's link.
- Deduced, never stored (`src/lib/kinship.ts`, pure, tested): `relatives()` → părinți, copii, frați (a parent in common), bunici, nepoți, unchi și mătuși, veri, socri, gineri și nurori, each person once in the closest group; `relativeName()` by gender (frate / soră / frate/soră …). `neamuri()`: connected groups over parent-child links and the families' couples with at least one link, named after the root ancestor with the most descendants (then a family head, the oldest birth date, the name): "Neamul Ciobanu Dumitru"; persons, members, families (active persons) and generations. `neamTree()`: indented tree from the root, spouses together, children oldest first, each person once.
- `src/server/kinship.ts`: `loadKinship(ctx.db)` (persons, links, couples; anonymised persons left out), `personKinship()` for the person page card "Rude în biserică" (`kinship-card.tsx`: Părinți and Copii editable by write roles with `PersonPicker`, the deduced groups with links and families; persons no longer in the register only for write roles, marked), the family page ("Familia face parte din neamul …"), Statistici: card "Neamuri" (at least two families, `listedNeamuri()`), `/statistici/neamuri` (`DataTable`, PDF `/pdf/neamuri`, Excel `/api/statistici/neamuri`, `src/lib/kinship-report.ts`) and `/statistici/neamuri/[id]` (the tree). All `read`: Vizualizare sees, the Rugăciune role does not; the prayer message never uses the neam.
- Parents outside the register (KINSHIP-STATUTE-PARENTS): `KinExternalParent` (tenant model: `nume` exactly as the children's `numeTata` / `numeMama` write it — a copy, not a new datum —, `gen` M/F); `PersonParent` has `parentId` OR `externalParentId` (exactly one: a database CHECK `person_parents_one_parent` and the code), source NUME_PARINTI for links confirmed from the names. In the graph a parent outside the register is the node `x:<id>` (`externalKey()`, `toStoredLink()` in `src/server/kinship.ts`), so siblings, cousins, uncles, grandchildren, neamuri and every rule count it like a parent; it is never counted as a person and a neam may carry its name ("Neamul Ciobanu Petru", "nu e în registru" in the tree and on the card, no link). Deleted when it has no children left (`deleteOrphanExternals`: removing a link, anonymising, the check, the import).
- Proposals from the parents' names (`nameProposals()` in `src/lib/kinship-parents.ts`, pure, tested; `nameKey`: no diacritics, any word order, extra spaces ignored): a) the name matches exactly one person of the register of the right gender and at least 12 years older → "X este tatăl / mama lui Y"; a parent outside the register already known with that name → its child; b) two or more persons with the same father's AND mother's names, or the same father's (or mother's) name with their surname in it and no differing other parent's name → "frați, cu părintele în afara registrului …". NOTHING is linked without a confirmation: De verificat → "Rudenie propusă după numele părinților" (`kinProposals()`, computed live, so they follow every save, campaign approval and check) with "Confirmă" (`confirmKinProposalAction`: recomputes the proposal on the server, creates the links through `parentLinkError`, audited with the names) and "Ignoră" (`ignoreKinProposalAction`, remembered in `KinProposalIgnore` by key); both counted in the badge. A link from the names whose name the file no longer carries is removed when the file is saved (`reconcileNameLinks()` in `savePersonAction`) and by the check.
- "+ Adaugă părinte": the picker lists every person, the ones the rules refuse disabled with the reason (`pickParent`, `PersonPicker` `disabled`). The person form and the campaign keep "Numele tatălui" / "Numele mamei" (Statut art. 14), with the hint to use "+ Adaugă părinte" when the parent is in the register; the personal link never shows anything about other persons.
- Anonymising deletes the person's links (and a parent outside the register left without children); the art. 15 copy has "Părinți și frați" and "Copii din registru"; the JSON backup has `rudenii` (`parinte` or `parinteExtern`) and `parintiExterni` (`src/lib/kinship-backup.ts`; the import re-checks the rules and skips refused links with a warning). Privacy notice 1.0, point 2 e).

### Discipline (Statut art. 27, 271, 272)

- `DisciplinaryMeasure` (tenant model): forma (art. 27 alin. 3), stare CERCETARE / APLICATA / INCHEIATA, dates, minutes, motiv, forum. Permission `disciplina` = a pastor (`User.isPastor`) or an Administrator / Secretar with `User.accesDisciplina` (DISCIPLINE-ACCESS, Statut art. 44 lit. d: „hotărăște și aplică măsurile de disciplinare a membrilor” under the pastor's coordination; art. 14 alin. 3 lit. d: the application's administrator is a technical role, so the role alone gives nothing), on the server for every read and write. The access is given / taken back by a pastor (`canGrantDiscipline()`; without any pastor user, an Administrator who has it, "Biserica nu are un pastor în aplicație") in Setări → Utilizatori și roluri, card "Acces la măsurile disciplinare (art. 44 lit. d)" (`setDisciplineAccessAction`, step-up, never to oneself, only an active ADMIN / SECRETAR who is not a pastor; SECURITY audit who / to whom / when, `accesDisciplinaDeLa` / `accesDisciplinaLa`); a role change to Vizualizare / Rugăciune drops it; the page opens for a pastor who is not an administrator with only that card. Pastor dashboard card "Acces la disciplină" (`disciplineAccessCard`). The `discipline_access` migration gave it to every non-pastor ADMIN (the seed's admin too). The import skips discipline for an importer without it. Tests: `discipline-access.test.ts`, `discipline.test.ts`, `permissions.test.ts`; other users never see measures, counts, categories, exports, audit entries (entity DISCIPLINE is filtered out of `/setari/jurnal`) or any hint. Never add discipline to a category, list, export or a non-admin page.
- `/persoane/[id]/disciplina` (admin): history, add / edit / delete (`src/server/actions/discipline.ts`, audited as DISCIPLINE with labels via `disciplineView`). An applied EXCLUDERE records the exit on the person (exit date, Excludere, minutes, Fost membru) and offers `/pdf/disciplina/[id]/informare` (art. 27 alin. 5). An applied SUSPENDARE: out of the TOTI expected attendees (`expectedWhere`), marked "suspendat — fără drept de vot" in the meeting form for admins only, and "Scoate din comitet" when still in the committee.
- Procedure documents (all `requireCtx("disciplina")`, built in `src/lib/discipline-print.ts`, pure): "Convocare la audiere" `/pdf/disciplina/[id]/convocare` from `audiereLa` / `audiereOra` / `audiereLoc` (art. 272 lit. a–b); "PV disciplinar" `/pdf/disciplina/[id]/proces-verbal` with the art. 272 lit. c contents (`abatere`, `raspuns` or `nuSaPrezentat`, the sanction, `incadrare`, `temei`, the appeal sentence); "Comunicarea sancțiunii" `/pdf/disciplina/[id]/comunicare` with the deadline `comunicatLa` + 15 days (`appealDeadline`, art. 27 alin. 10–11). Moving a measure out of CERCETARE requires the minutes of a COMITET-rule meeting and those fields (`closingErrors`).
- The ordinary minutes (page, PDF, Word, e-mail, share, preview) of a meeting linked to a closed measure (or a reinstatement) show only "Punct tratat în ședință închisă." (`CLOSED_SESSION_LINE`, `getMeeting().sedintaInchisa`); the content is never printed there.
- `contestatieLa` / `contestatieRezultat` (ADMISA | RESPINSA); Acasă shows administrators the open appeal windows and the pending appeals.
- Reinstatement (art. 271, `reinstateAction`): on an applied SUSPENDARE, RETRAGERE_DREPTURI or EXCLUDERE, with the written request's date (`cerereRepunereLa`) and the committee minutes (`repunereMeetingId`); closes the measure (INCHEIATA, end = the minutes' date); after an EXCLUDERE the person is MEMBRU again with `modIntrare` REPRIMIRE, `dataMembru` and `intrareMeetingId` from the minutes, exit fields cleared. Audited on the measure and the person.
- Export/import (administrators' files only): the procedure fields on `discipline` entries, `pvRepunere` for the reinstatement's minutes.
- Recommendation letter: `recommendationDiscipline()` (`src/server/discipline.ts`) — no open measure → "nu are măsuri disciplinare" (documented deviation from the prototype's "nu are datorii sau abateri de disciplină"); APLICATA → the letter states the measure (art. 27 alin. 9) and only an admin can issue it; CERCETARE → refused (art. 27 alin. 6) unless the admin ticks the domicile exception (`Document.exceptieDomiciliu`, recorded in the text).
- Backup: `discipline` collection only in an administrator's export (`src/lib/discipline-backup.ts`); anonymising deletes the measures.

### Data-update campaign

- `DataCampaign` and `DataUpdateLink` (tenant models). Setări → "Actualizare date" (`/setari/actualizare-date`, `write`; starting, closing and the general link: `admin`, `src/server/actions/campaigns.ts`, audited as CAMPAIGN by person name only). A campaign creates one personal link per adult in the record (`createMissingLinks`: no exit, not Fost membru, not anonymised, 18+ or no birth date; "Adaugă persoanele noi" later).
- Tokens are never stored (`src/server/campaign-tokens.ts`): a link's token is an HMAC of its id and a random nonce under a key derived from `AUTH_SECRET`; the row keeps the nonce and `tokenHash` (sha256), so "Copiază linkul" can show it again and "Generează link nou" (new nonce) revokes it. The general link (`/actualizare/g/<token>`, QR, PNG, A5 poster `/pdf/afis-actualizare/[id]`) works the same way per campaign.
- Statuses (`linkStatus`, `src/lib/campaign.ts`): Netrimis / Trimis / Deschis / Verificat / Completat / Blocat / Aprobat; "fără telefon" persons are flagged (they cannot pass the identity check). `campaignMessage()` is the text of "Partajează" / "Copiază mesajul".
- Personal link rows (`link-row.tsx`, not-sent first): name (never cut), "Netrimis" / "Trimis <data>" / "A răspuns", then one primary action — "Trimite pe WhatsApp" = `whatsappDirectUrl()` (`https://wa.me/<number>?text=<campaignMessage>`; `internationalPhone()` in `src/lib/phone.ts`: 8 digits → 47…, +47 / 0047 → 47…, +40 / 0040 / 07… → 40…, other +/00 codes kept, else null → disabled "Lipsește telefonul"), or "Vezi răspunsul" (`/de-verificat/<submission>`) once answered — and "⋯" with Copiază mesajul, Partajează (only where the browser can share), Marchează ca trimis / Anulează marcarea, Generează link nou (in-app confirmation "Linkul trimis deja nu va mai funcționa. Continuați?", never `confirm()`). Back from WhatsApp (visibilitychange) the row asks "Ați trimis? Marchează ca trimis"; never marked by itself. The row actions return `FormState` without a redirect; `linkWhatsappAction` only audits "link trimis pe WhatsApp" by the person's name (no link, no phone). No "Copiază linkul" per row: the message carries the link; "Copiază toate linkurile ca listă" stays above.
- Identity check (`src/lib/identity-match.ts`, pure): name by `nameKey` words (every surname word, at least one first-name word, at most one unknown word) and the last 8 phone digits; both on the same person; never say which part failed.
- Public pages (under `(auth)`, `/actualizare` in `PUBLIC_PATHS`; actions in `src/server/actions/data-update.ts`, helpers in `src/server/data-update.ts`): the church and person come only from the link row found by the token hash; writes through `tenantDb`. Unknown, revoked, expired and closed links show the same neutral page. 20 identity checks per hour per IP across all links (`sharedRateLimiter("campaign-identity")`); 5 wrong checks lock a personal link (audited by name).
- Personal link `/actualizare/[token]`: identity → httpOnly cookie for 30 minutes bound to the link (`personalIdentityValue`, path `/actualizare`) → the form prefilled from the register (or the pending submission): own fields (`SELF_FIELDS`) and own minor children (`adultChildren`: the adult heads the family or is spouse / parent by rudenie), never notes, roles, groups, status or discipline. Submit replaces the PENDING `DataUpdateSubmission` and writes `Consent` rows at once (ONLINE, `givenByPersonId` for minors). A consent's `textVersion` is the notice published when the answer was sent (`privacyVersionOf()` in `src/server/campaigns.ts`: the model's number, e.g. "1.0", or "text-<hash>" for a church's own text), stored in the submission as `versiuneNota` so the general link's consents written at approval keep it; answers that did not record it fall back to the campaign's `privacyTextVersion`. Older consents keep their version.
- General link `/actualizare/g/[token]`: the typed name and phone go into an AES-GCM encrypted cookie; the form always opens empty; on submit the person is matched (exactly one active adult) or left unmatched; the consents stay in the proposal until approval.
- `parseProposal()` (`src/lib/schemas/data-update.ts`): the notice checkbox and every Da / Nu answer are required (no default); children travel as JSON in the hidden field `copii`; honeypot `website`.
- "De verificat" (`/de-verificat`, `write`, nav badge from `pendingBadges()` like Cereri): actual → propus per field (`selfChanges` / `childChanges`, `src/lib/data-update-review.ts`) with a checkbox each; general submissions choose the person (match preselected) or "Creează persoană nouă". `applyDecision()` (`src/server/review.ts`, called by `decideSubmissionAction`) does it in one transaction: chosen fields with `personDerived`, new children in the adult's family (a family is created around the adult when needed; statut Aparținător in a believers' family, else Prieten; rudenie Fiu / Fiică), `settleFamily`, consents of the general link and of new children, audit with `sursa: "Actualizare date <campanie>"`; status ACCEPTED / PARTIAL / REJECTED (with the note).
- Consents in the app: "Acorduri GDPR" card on the person page (all roles; Da / Nu / Neexprimat, date, source, "dat de <părinte>"); Acasă birthdays list only BIRTHDAY = Da (`?aniversari=toti` for write roles marks "fără acord"); categories `nota-confirmata`, `nota-neconfirmata`, `acord-<tip>-da|nu|neexprimat` (a withdrawal counts as Nu; `CategoryInput.consents` from `loadConsentStates`); export columns `acord_<TIP>`; the campaign page shows the totals and "Exportă situația acordurilor" (the person export with those columns). Backup: `campaigns` and `consents` (`src/lib/consents-backup.ts`; never links, tokens or submissions; an identical answer is not imported twice). Anonymising deletes the person's consents, links and submissions.
- Paper consents: `/persoane/[id]/acorduri` (`write`): current answers (`currentConsents`, `src/lib/consents.ts`: the latest row per kind; a withdrawn one is "Retras"), "Retrage acordul" (`withdrawnAt`), "Înregistrează acord pe hârtie" (source PAPER, date, the parent for a minor); audited on the person.

### Statistics categories

- `src/domain/categories.ts` (pure): every person category (statut, copii, botez și intrare, vârstă, slujire, familie, ieșiri) as ids. The figures shown on Acasă reuse computeStats' own lists, so a list has exactly as many rows as its number (`categories.test.ts`). `categoryContext(input)` computes once; `combineCategories` gives union ("oricare") or intersection ("toate"). Copii ai membrilor / aparținătorilor follow the stats' family rule (a member, resp. an aparținător and no member, in the family).
- Export: `/persoane/export` (`export`: Administrator, Secretar) — categories (any / all), reference year, a role for "cu-functie", columns (`EXPORT_COLUMNS`, `src/lib/person-export.ts`), order, and a live count (`exportCountAction`). `POST /api/persoane/export` (`requireCtx("export")`) asks for the password again unless the 10-minute grant cookie is valid (`src/server/export-grant.ts`, HMAC with a key derived from `AUTH_SECRET`), then sends Excel (`exceljs`, title row, bold frozen header), CSV (UTF-8 BOM, ";") or a PDF list (`table` block, landscape over six columns), and writes a SECURITY audit entry with the categories, the row count and the format — never names. "Exportă lista" on a category list prefills it.
- `/persoane?categorie=<key>[&categorie=…][&an=YYYY][&functie=<role>]` (`src/lib/category-params.ts`, `loadCategories()` / `selectionIds()` in `src/server/queries/categories.ts`): the selection replaces the status filter and keeps search, "Pe familii", pagination and Anterior/Următorul (`din` carries it). Every figure on Acasă links there with the same year (`an` only when one was chosen); a dare de seamă's page lists its year's figures as links.
- Marital status (`computeStats`: `adulti`, `casatoriti`, `necasatoriti`, `stareCivilaNecompletata`; not in the prototype, README "Diferențe" 22): adults in the record at the reference date (18+, no birth date = adult; Fost membru only while still a member then), married = `dataCasatoriei` up to that date, unmarried = `necasatorit` or a later marriage, the rest not filled in; the three always add up to `adulti` (`categories.test.ts`). Categories `adulti`, `casatoriti`, `necasatoriti`, `stare-civila-necompletata` (group "Stare civilă"); cards on Acasă (the last one in the warning colour above 0, `.stat-warn`) and Statistici, `StatLinks`, the "Statut și gen" table's Căsătoriți / Necăsătoriți columns ("—" for minors) and the report line "- Adulți: N (căsătoriți X, necăsătoriți Y, necompletat Z)" (parity test `statuteBlock`).
- `mod=toate` intersects the categories (the Statistici pyramid and status table link e.g. `categorie=barbati&categorie=varsta-18-30&mod=toate`).

### Statistici

- `/statistici` (all roles; "Mai mult" on phones, sidebar on desktop), `?an=YYYY`: `loadStatistics()` (`src/server/queries/statistics.ts`) over `src/domain/evolution.ts` (pure): `evolution()` = 10 years ending with the chosen one (members at 31.12, the current year today; entries by mode, exits by mode, binecuvântări, net growth), `byMonth()`, `structure()` (pyramid, ages, bands, status × gender, families). Every number is a category count, so each links to its list.
- Charts are server-rendered SVG (`src/components/charts.tsx`: `LineChart`, `StackedBars`, `Pyramid`; `<title>` + `<desc>` + a table beside each; colours `--chart-1…4`, both themes). "N persoane fără dată de naștere" under the age charts links to `fara-data-nasterii`.
- `/pdf/statistici` (PrintSpec `chart` blocks drawn as vectors by pdfkit; Word and `printToText` show them as tables) and `/api/statistici/excel` (one sheet per table) share `statisticsTables()` (`src/lib/statistics-report.ts`). Aggregate numbers only, so no password and no audit entry.
- Dare de seamă: "Include evoluția pe 5 ani" (`evolutie` in `documentDraftAction`) appends `evolutionText()` after `generateDocumentText`'s output; unchecked, the text is the parity-tested one.

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
- Word: `renderDocx(spec)` (`src/server/docx/render.ts`, `docx` package) renders the same `PrintSpec` as an editable .docx (plain paragraphs and tables, Times New Roman); `docxResponse()` sends it as a download. The minutes use it at `/pdf/proces-verbal/[id]/word` ("Deschide în Word"); `meetingSpec()` (`src/server/pdf/meeting.ts`) is shared by both formats.

### Rich text (editor, storage, rendering)

- One editor for minutes and documents: `src/components/rich-editor/` (Tiptap 3, MIT). Toolbar: Îngroșat, Înclinat, Subliniat, Mărime (mic / normal / mare / foarte mare), Aliniere (stânga / centru / dreapta / stânga-dreapta), numbered and bulleted lists, Anulează / Refă, Șterge formatarea. No colours, fonts, images, links or HTML. The JSON travels in a hidden input; `RichView` shows it read-only with React elements (never `dangerouslySetInnerHTML`).
- Stored as the editor's JSON, validated by `src/lib/schemas/rich-text.ts` (`checkRich`, `parseRichJson`, `richField`): only doc, paragraph (`attrs.align`), text, hardBreak, orderedList, bulletList, listItem and the marks bold, italic, underline, textSize; strict objects, ≤ 200 KB, lists nested ≤ 6 deep. Anything else is refused.
- The plain projection `richToPlain()` (`src/lib/rich-text.ts`) is always stored next to it (search, exports, parity-tested functions); `plainToRich()` turns plain text into paragraphs, "1. " and "- " lines into lists (exact round trip).
- Printing: the `rich` block of `PrintSpec` (optional `marker` for a minutes point). `richLines()` flattens it for both renderers: pdfkit uses Source Serif 4 Regular / Bold / Italic / BoldItalic, sizes relative to the layout's base (mic −2, mare +3, foarte mare +6 pt); Word gets the same runs. `printToText(spec, { marks: true })` shows marks and alignment for tests.

### Correspondence register (Statut art. 43 alin. 7)

- Art. 43 alin. 7: „Secretarul ține evidența membrilor bisericii, efectuează corespondența, întocmește procesele-verbale ale ședințelor de comitet și ale Adunării Generale, ține la zi evidența patrimoniului acesteia și semnează, alături de pastor sau un delegat al acestuia, toate documentele oficiale ale bisericii locale.”
- `Correspondence` (tenant model; `nr` unique per church and `an`, `data`, `directie` INTRARE | IESIRE, `dela` / `catre`, `subiect`, `rezolvare`, optional `documentId`, `raspunsLaId`, `personId`; `correspondence` migration). Metadata only: no attachments (ROADMAP 6), never the letter's text.
- Numbering (decision): one sequence per year for entries and exits (`lockCorrespondenceRegister` / `nextFreeCorrespondenceNumber`, a typed number is checked). Documents keep their own `Document.nr` (existing numbers never change); the register lists every document of the year as an exit with „Nr. document” (`registerRows()`, `src/lib/correspondence.ts`, pure), unless a register row already points to it.
- `/corespondenta` („Corespondență”, side group Evidență, „Mai mult” on phones; `read`, Rugăciune none): `DataTable` (Nr., Data, Intrare / ieșire, De la / către, Subiect, Rezolvare, Nr. document), year select, filter Toate / Intrări / Ieșiri, search; „+ Înregistrează intrare” / „+ Înregistrează ieșire” (`write`). On an entry: „Răspunde” (`/corespondenta/nou?raspunsLa=`: an exit to its sender, linked) or „Scrie scrisoarea de răspuns” (`/documente/nou?tip=scrisoare&raspunsLa=`: `catre` prefilled; on save `registerDocumentReply()` makes a linked exit with the document). An answered entry whose resolution is empty or „În lucru” becomes „Răspuns cu nr. N/an” (`markAnswered`). Delete leaves a gap in the numbers. Audit entity CORRESPONDENCE on every write. Export „Registru de intrare-ieșire <an>”: `/pdf/corespondenta`, `/api/corespondenta` (the page's year, filter, search and sort).
- Art. 15 copy: „Corespondență (registru de intrare-ieșire)” (nr, date, direction, subject) for the rows linked to the person. Backup: `corespondenta` (`src/lib/correspondence-backup.ts`; a number taken in the target church gets the next free one, with a warning). Anonymising replaces the name in `dela` / `catre` only on the rows linked to the person, then unlinks them. Privacy notice 1.0, point 2 f).

### Patrimony (Statut art. 43 alin. 7, art. 54–55)

- Art. 54 alin. 2: the patrimony is managed by the pastor and the committee or their delegates; art. 43 alin. 7: the secretary „ține la zi evidența patrimoniului acesteia”.
- `Asset` (tenant model, `patrimony` migration): `nrInventar` unique per church (empty = next free, advisory lock), `denumire`, `categorie` (nomenclature `Church.categoriiPatrimoniu`, defaults Clădiri și terenuri, Mobilier, Instrumente muzicale, Sonorizare și video, Echipamente IT, Bucătărie, Altele; edited in Setări → Nomenclatoare), `cantitate`, `valoare` (optional, whole NOK, the line's value), `dataIntrarii`, `provenienta` CUMPARARE / DONATIE / ALTELE, `loc`, `stare` BUN / NECESITA_REPARATII / SCOS_DIN_UZ, `dataIesirii` + `motivIesirii`, `observatii`, `responsabil` (text) or `responsabilId` (person, SetNull). No other personal data.
- `/patrimoniu` („Patrimoniu”, side group Evidență; `read`, Rugăciune none): `DataTable`, filter În uz (default) / Bune / Necesită reparații / Scoase din uz / Toate, category select, search; totals per category (lines, pieces, value). „+ Bun nou”, edit, „Scoate din uz” (date + reason, `retireAssetAction`; never deleted; a retired good is not edited) — `write`, audited (ASSET). Export „Inventarul bunurilor la <data>”: `/pdf/patrimoniu` (with the pastor's and secretary's signatures) and `/api/patrimoniu` (goods + totals), the page's filter and sort (`src/lib/patrimony.ts`, pure).
- Acasă (write roles): in November „Inventarul bunurilor — verificați patrimoniul” (`inventoryReminder`). The annual report gets, after the parity-tested text, „Patrimoniu: N bunuri în evidență.” only when goods were in use at the year's end (`patrimonyLine`, `generateReportText`), no values.
- Backup `patrimoniu` (`src/lib/asset-backup.ts`; a taken inventory number gets the next free one, with a warning). Anonymising unlinks `responsabilId`.

### Document register

- Allocate numbers in an interactive transaction: first `lockDocumentRegister(tx, churchId, year)` (advisory lock), then `nextFreeNumber`.
- The register year is the year of the document date.
- A unique index `(churchId, anRegistru, nr)` guarantees there are no duplicates.
- Page layout: the minutes' model applies to documents too: `Document.layout` (own, null = default) over `Church.docLayout` (saved by `admin`) over `DEFAULT_LAYOUT`. `/documente/[id]/asezare` (`write`) uses the shared `LayoutEditor` (`src/components/layout-editor.tsx`) and `saveDocumentLayoutAction`; the PDF and Word routes take `?previzualizare=1&…`; audited like the minutes' layout; exported as `asezare` on documents. Groups and events keep the standard layout.
- Rich text: `Document.textRich` (editor JSON) next to `text`, which keeps the projection (search, register, exports, parity). `documentSchema` derives `text` from `textRich`; "Regenerează din șablon" fills the editor with `plainToRich()` of the generated text, and a saved or hand-edited text is never overwritten automatically. `documentSpec()` (`src/server/pdf/document.ts`) feeds the PDF and `/pdf/document/[id]/word` ("Deschide în Word", all roles). The audit log adds `formatare`. Export/import: `textRich` on documents (`src/lib/document-backup.ts`).

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

### Officiants (Statut art. 30)

- `ChurchRole.ordinat` (DIACON | PREZBITER | PASTOR, `src/lib/officiants.ts`): set per entry in Setări → Funcții și slujiri (admin, audited as `ordinat`); the defaults Pastor, Prezbiter and Diacon get it at signup (`defaultRoleGroupsData`) and by the `officiants` migration (by name).
- `OfficiantField` (`src/components/officiant-field.tsx`): "Oficiat de" on the person form (`botezOficiant`) and `Event.oficiant` on events of the types in `OFFICIATED_EVENT_TYPES` (Botez, Binecuvântare copil, Nuntă, Înmormântare, Cina Domnului); suggestions are the current holders of an ordained role (`officiantOptions()`, highest ordination), free text stays allowed. A diacon named for a baptism or a wedding gets the non-blocking art. 30 alin. 1 lit. a warning (`officiantWarning`, names matched in any order, titles ignored).
- "Cina Domnului" is a default event type. Export/import: `oficiant` on events, `ordinat` on roles (older files: the defaults by name for new roles).

### Two-step authentication

- Login: `signInOrMessage` (`src/server/actions/auth.ts`) checks the password (`checkPassword`, `src/server/login.ts`, with the account lock), then starts a `LoginChallenge` (`src/server/two-factor.ts`). Without a second factor it is verified at once and passed to `signIn`; with one, the browser gets an httpOnly cookie and goes to `/autentificare/cod`; when `Church.require2fa` is on and the user has none, to `/autentificare/configurare`.
- Factors: TOTP (`src/server/totp.ts`, RFC 6238 with node:crypto; the secret encrypted with AES-256-GCM under a key derived from `AUTH_SECRET`; a setup writes `pendingTotpSecretEnc` and only the first valid code swaps it into `totpSecretEnc`; each code accepted once via `totpLastStep`), a 6-digit e-mail code (hashed, 10 min, single use; only when e-mail is configured), and 8 single-use recovery codes of 12 characters, hashed with `hashSecret()` (lighter scrypt); older sha256 8-character codes are accepted until regenerated (`hasLegacyRecoveryCodes`, note in Cont → Securitate). 5 wrong codes delete the challenge.
- Cont → Securitate: enable/disable each method and regenerate recovery codes, each with the password; the last method cannot be disabled while the church requires 2FA. Audit entity `SECURITY` (enable/disable, wrong codes, recovery code used); codes are never logged or stored in clear.
- `src/server/sign-in.ts` (`finishSignIn`) is deliberately not a server action.

### Passkeys and step-up (WebAuthn)

- `@simplewebauthn/server` / `@simplewebauthn/browser` (exact versions; npm `overrides` points next-auth's optional peer at them). `UserPasskey` (reached only through the user: credentialId, public key, counter, transports, deviceName, backedUp, lastUsedAt) and `WebAuthnChallenge` (sha256 of the challenge, single use, 2 minutes, bound to a purpose and, except the passkey-only sign-in, to the user). `src/server/passkeys.ts`: RP ID = APP_URL's host, origin = APP_URL (https, or localhost); without APP_URL passkeys are off (`isPasskeyConfigured`). Assertions require UV, a non-decreasing counter, the origin and RP ID; a challenge is deleted on first use whatever the outcome, so a challenge for document A cannot sign document B. 10 assertions per user (per IP for the passkey-only sign-in) per 15 minutes. `verifyUserPresence(user, purpose, response)` audits "confirmare pe dispozitiv: <deviceName>". No biometric data ever reaches the server.
- Purposes (`PURPOSE`): `inregistrare`, `login`, `login-factor-2`, `confirmare` (step-up), `semnatura-salvata`, `semnatura:<documentId>`.
- Cont → "Face ID / amprentă / PIN-ul telefonului" (`passkeys-card.tsx`, actions in `src/server/actions/passkeys.ts`): add (password first; residentKey preferred, UV required, attestation none), list, remove (password; the last one is kept while the policy applies).
- Sign-in: "Intră cu Face ID / amprentă" on /autentificare (discoverable; counts as two factors, satisfies `require2fa`); a passkey is also a second factor after the password (`signInOrMessage` counts it; the code step offers "Confirmă cu Face ID / amprentă" first). `Church.passkeyPolicy` (Setări, admin, audited; step-up to change): for pastors and administrators (`passkeyPolicyApplies`) the passkey-only sign-in is refused, codes are only a recovery (each use audited as `intrareRezerva`, shown on Acasă to administrators for 30 days), and users without a passkey land on Cont to add one.
- Step-up (`src/server/step-up.ts`): an HMAC cookie (user id + sessionVersion + expiry, 15 minutes) set by `confirmStepUpAction` after a device confirmation, or the password for users without a passkey. Required by: full export (`/api/export`) and category export (`sensitiveCheck`; a passkey user cannot use the password there), discipline pages, PDFs and actions, user role and pastor changes, statute uploads and excerpts, the privacy notice and the 2FA / passkey policy settings. `StepUpGate` (`src/components/passkey/step-up-gate.tsx`) renders the confirmation in place of a page or as a bar above sensitive settings.

### Privacy and access

- Public privacy notice `/confidentialitate/<slug>` (and the general template at `/confidentialitate`): `Church.privacyText`, edited in Setări; empty = `privacyTemplate()` (`src/lib/privacy.ts`): the model notice 1.0 (nota de informare 1.0, the first published one), `PRIVACY_NOTICE_1_0` in `src/lib/privacy-notice.ts`, identical to `docs/privacy-notice-1.0.md` (unit test; change both together; no AI service, Render and Resend the only providers, the weekly prayer for families as purpose e) and in point 5 ("vede doar numele familiilor"), children named only with the parents' consent; a church with an empty text publishes 1.0 at once, its own edited text is never replaced). **Versions are counted from publication on `main`; on `dev` the notice is a draft and is changed in place.** After it reaches `main`, a change is a new version: a new constant and `docs/privacy-notice-<v>.md`, `PRIVACY_NOTICE_VERSION` raised. The drafts 1.1 / 1.2 were removed; the `notice_1_0` migration moved `Church.privacyVersion` "1.1" / "1.2" to "1.0" and only counted (never changed) consents, answers (`versiuneNota`) and campaigns that recorded them, filled with the church's name, address, org.nr., e-mail, phone, `Church.comunitate` and the adoption date (`privacyAdoptedAt`); an empty setting leaves its bracketed placeholder visible. `privacyBlocks` reads that format line by line (numbered and all-caps headings, "- " items). Admins see "Există o versiune nouă a modelului (<v>)" only when the church publishes its own text and its `privacyVersion` (empty = 1.0, nothing older was published) is older than the model (`privacyModelOutdated()`): "Vezi diferențele" (`/setari/nota-informare`, `lineDiff`) and "Folosește modelul nou" (`adoptPrivacyModelAction`); an edited text is never replaced otherwise. Linked from the application form and the login page.
- Contact data after an exit (privacy notice point 6): `contactRestricted()` (`src/lib/contact-access.ts`) hides phone, e-mail and address of a person with an exit date or Fost membru from non-administrators in lists, the person page, the edit form (kept unchanged on save), groups, the person export and the JSON backup. After 12 months (`expiredContactWhere`, `src/server/retention.ts`) they appear on Acasă for admins, "Șterge acum" (`deleteExpiredContactsAction`) clears them in one transaction (SECURITY audit with the count). Register data are never deleted.
- "Copie a datelor (art. 15 GDPR)" on the person page (admin): `GET /api/persoane/[id]/copie?format=pdf|json[&disciplina=1]` (`loadDataCopy`, `src/lib/data-copy.ts`), SECURITY audit with the format.
- Setări → Utilizatori shows the last login and its truncated IP (`User.lastLoginIp`, only the network part is stored, `truncateIp`), and "Acces nefolosit de 90 de zile".
- Removing a person is `admin` only, in two steps: anonymise (`anonymizePerson()` in `src/server/anonymize.ts`: "Persoană ștearsă"; contact data, notes, roles, groups, aliases, mențiuni and drawn signatures removed; the linked application blanked and unlinked; the person's and the application's audit details blanked; the name (both orders), phone and e-mail replaced by raw SQL with an explicit `churchId` in meetings, sends, events, groups, notes, families and every audit entry; statistics unchanged) or delete for good. Documents in the outgoing register keep `persoana` (official record); `tests/integration/anonymize.test.ts` scans every table for leftovers.
- Export (`POST /api/export`) asks for the password again and writes a `SECURITY` audit entry with the file size; `GET` redirects to Setări → Date.
- No AI service processes personal data. Reading scanned documents was withdrawn at the church's request (2026-10: code, `Church` column and dependencies removed by `extract_remove`); never add a feature that sends personal data to an AI provider. The audit entity `EXTRACT` stays only so older entries read "Citire document (funcție retrasă)"; nothing writes it.

### Membership applications

- Public form `/cerere/<slug>`, under `(auth)`, listed in `PUBLIC_PATHS`. `Church.slug` is unique; `slugify()`/`slugVariant()` in `src/lib/slug.ts` are mirrored by the backfill in the `applications` migration.
- The church comes only from the slug, never from a form field. The row is written through `tenantDb(church.id)`, and an audit entry is written with user "Formular online".
- Anti-abuse: a honeypot field `website`, plus `sharedRateLimiter("applications")` with 5 submissions per hour per IP and church.
- Accepting goes through `savePersonAction` with a hidden `cerere` field. The person and the ACCEPTED application (with `personId`) are written in one transaction.
  - A same-name, same-birth-date person returns `PersonFormState.duplicate`; `fortat=1` saves anyway.
- Export/import: the `applications` collection lives in `src/lib/application-backup.ts`, outside `src/domain`; files without it import unchanged.
- Setări → "Linkul cererii de membru" (`write`): QR code from `src/server/application-link.ts` (`qrcode`, local), PNG download, copy, share, A5 poster `/pdf/afis-cerere`, and "Trimite linkul pe e-mail" (`sendApplicationLinkAction`: one message to all recipients, fixed subject and frame with the link built only from `APP_URL`, a note of ≤ 1000 characters, 20 sends per church per hour, audited with the count of addresses only). The statute route is cached publicly for an hour with an ETag from `uploadedAt` and limited to 60 requests per hour per IP.
- Statutes: `ChurchDocument` (tenant model, kind `STATUT_CULT` | `STATUT_INTERN`, PDF ≤ 10 MB as `Bytes`, one per kind) uploaded in Setări by `admin` (`src/server/actions/statutes.ts`, audited as SETTINGS with file name and size). Public route `/cerere/<slug>/statut/<cult|intern>` serves it inline, else 404.
  - The public form shows one consent per published statute, enabled after "Deschide statutul" (sessionStorage flag per statute version). `submitApplicationAction` rejects a submission missing a consent for any published statute and stores `consentStatutCult` / `consentStatutIntern` / `consentAt`.
  - Accepting adds "A acceptat … la <data>" to the person's note (`consentNote()`). The PDFs are not exported; the consent flags are.
- Statute excerpts: `Church.statutExtrase` (JSON sections `{ titlu, articol, pagina, text }`, `[]` = the defaults `DEFAULT_EXCERPTS` in `src/lib/statute-excerpts.ts`, which equal `docs/statut-extrase.md` verbatim — a unit test checks it; edit both together). Setări → "Extrase din statut afișate în cererea de membru" (admin; `saveStatuteExcerptsAction` / `resetStatuteExcerptsAction`, audited SETTINGS as `extraseStatut`; saving the defaults stores `[]`). `StatuteExcerptsCard` shows them on `/cerere/<slug>` above the consents ("Ce înseamnă să fiți membru al bisericii", first block open, "Statut <articol>") and collapsed on `/actualizare/<token>` for MEMBRU / APARTINATOR. Links go to `/cerere/<slug>/statut/cult#page=<pagina>` ("Textul complet" at the rights section's page, default 12) and appear only when the Cult's statute is published; following one counts as opening the statute, reading the card does not.

### Church roles (funcții și slujiri)

- `RoleGroup` (tenant model: "Funcții", "Slujiri", …) holds the entries `ChurchRole` (tenant model, `groupId`); `PersonRole` links persons to roles, with optional `since`/`until`. Display order: group `sortOrder`, then role `sortOrder` (`ROLE_ORDER`).
- `DEFAULT_ROLE_GROUPS` (`src/lib/roles.ts`) is created at signup and by the `person_form_polish` migration for existing churches; keep both in sync. Names are compared with `roleKey()` (case and diacritics ignored).
- Editing groups and entries (`/setari/functii`, "Funcții și slujiri") needs `admin`. An entry held by anyone cannot be deactivated; a group with active entries cannot be deactivated. The person form's "+ Adaugă" (`addRoleInlineAction`, `write`) creates an entry inline or selects the existing one.
- The committee is a person flag, `Person.inComitet` ("Membru în comitet" on the form, audited with the person). The Persoane filter "Comitet", the attendance rule `COMITET` and the Acasă card use it.
- The person form sends the roles as JSON in the hidden field `functii` (`personRolesSchema`); `assertPersonRoles` checks the ids belong to the church. The audit log stores them as the text field `functii`.
- Export/import (`src/lib/roles-backup.ts`): `roleGroups`, `roles` (each with `grup`), `functii` (by name) and `inComitet` on members. Older files: roles land in the first group, and `comitet` roles give their current holders the flag.
- The old free text `Person.slujire` is no longer edited: the migration moved it to the top of the note ("Slujire (vechi): …", `noteWithSlujire()`); the column stays one release (export writes it, import reads it).

### Groups

- A group can be linked to two church roles: `Group.functieId` ("Slujirea grupului", the ministry it belongs to) and `Group.functieLiderId` ("Funcția de conducere", the role whose holders lead it); both SetNull, checked against the church on save. The form offers the active roles by role group; "Creează din funcție" preselects the ministry. Setări → Funcții și slujiri shows "Folosită de grupurile: …". The `group_kind` migration linked groups named exactly like one active role.
- Automatic members: `GroupMember.sursa` AUTO | MANUAL. A linked group's members are AUTO (every current holder of `functieId` or `functieLiderId`: in the register, not Fost membru, not anonymised, no past end date; `activeHoldersWhere()`) plus MANUAL extras. `syncRoleGroups(tx, user, scope)` (`src/server/group-sync.ts`) adds and removes AUTO rows (a MANUAL row of a holder becomes AUTO; MANUAL rows are never removed) in the caller's transaction, with one audit entry per changed group. Call it whenever roles, the register status or a group's links change: the person form (`writePersonRoles` returns the roles to sync), anonymising, the group form (quiet for that group, its own audit covers it), role deactivation, import. The group form sends only the manual members; the page shows "Din slujirea „X”" (read-only, links to the person's form) and "Adăugați manual"; the person page marks "(automat)". The `group_sync` migration ran the first sync in SQL.
- Responsible person: `Group.responsabilId` (Person, SetNull) next to the old text `responsabil`, which keeps the person's name when linked and stays the fallback. The form uses `PersonPicker` (`src/components/person-picker.tsx`): search, then "Au funcția de conducere", "Au slujirea grupului", "Membri ai grupului", "Toate persoanele" (each person once), "— niciunul —"; a person outside the group gets "Adaugă-l și în grup" (MANUAL). Checked with `assertPersonsInChurch`. Shown as a link on the group page, by name in the PDF, and as "Responsabil pentru: …" on the person page; anonymising unlinks it. The `group_lead` migration linked texts naming exactly one active person (nameKey).
- Export/import: `functie` and `functieLider` on groups, by role name, and `sursa` (member id → AUTO/MANUAL) and `responsabilId` (`src/lib/group-backup.ts`); a text-only responsible is linked when it names exactly one active person; older files import members as MANUAL, then the sync runs. The whole JSON is built by `buildExportJson()` and read by `parseImportJson()` (`src/server/backup-json.ts`), shared by the export route, the import action and the tests.

### Meeting attendance

- Each meeting type has a rule (`Church.regulaPrezenta`, `src/lib/attendance.ts`): `TOTI` (members in the record), `COMITET` (persons in the record with `inComitet`) or `MANUAL`. Defaults: Adunare generală → TOTI, Comitet and Frați slujitori → COMITET.
- `MeetingAttendee.status` is PRESENT or ABSENT. Anything that lists the persons present must filter on `status: "PRESENT"`.
- On save, `expectedAttendees` (as of the meeting date) minus the persons present become ABSENT rows, and `Meeting.asteptati` stores the expected count. The quorum line uses it, so meetings saved before the rules show no quorum.
- Export/import: `absenti`, `asteptati`, `nr`, `puncte`, `observatii` and `formulaIncheiere` on each meeting (`src/lib/meeting-backup.ts`).

### General Assembly and votes (Statut art. 46)

- `src/lib/general-assembly.ts` (pure). A type is an AG when ticked in Setări (`Church.tipuriAG`; empty = the type named "Adunare generală"); the quorum line shows only for the types in `Church.tipuriCvorum` (default none).
- An AG meeting has `convocatLa`, `convocareText` (the scope), `tipAG` (ORDINARA | EXTRAORDINARA) and `convocataDeComunitate`. The form warns, never blocks, when the announcement is missing or under 14 days before (7 when the Comunitate convenes it, art. 461). The minutes show "Membri cu drepturi depline: m · prezenți: n · convocată la <data> (<zile> zile înainte)" instead of a quorum (`minutesAttendance()`, shared by the PDF, Word, page and preview).
- Votes per point (any type, optional): `Meeting.voturi` JSON aligned with `puncte` (`voteSchema`, hidden field `voturi`). Printed under each point as "Votat: pentru X, contra Y, abțineri Z — adoptat|respins"; AG and committee types need more than half of those present, others more for than against. With votes recorded the default closing ("votate în unanimitate") is left out.
- "Convocare Adunare Generală" (`convocare`) is a numbered outgoing document built from the meeting (`/documente/nou?tip=convocare&sedinta=<id>`), signed by the pastor.
- Acasă (write roles), from 1 October: "Adunarea Generală ordinară nu a avut loc în <an>" (art. 46 alin. 3).
- Export/import: `convocatLa`, `convocareText`, `tipAG`, `convocataDeComunitate`, `voturi` on meetings.

### Committee mandate (Statut art. 45)

- `src/lib/committee.ts` (pure). `Church.comitetAlesLa`, `comitetAlegereMeetingId` (the election's minutes; plain id checked against the church on save, no FK) and `comitetPrelungit`. The mandate ends 5 years after the election, 10 when extended; `extendCommitteeMandateAction` refuses a second extension, and a new election date clears the extension. Setări → "Comitetul bisericii" (with the current members) (`admin` edits, audited SETTINGS); Acasă warns write roles from 6 months before the end (`mandateNotice`).
- Ticking "Membru în comitet" shows `committeeEligibility()` (`src/server/queries/committee.ts`): under 2 years a member, under 5 years since baptism (or missing dates); for administrators an applied suspension or exclusion; every other role always gets "Verificați condițiile din Statut art. 45 alin. 4" instead, so nothing about discipline leaks. Never blocking.
- `MeetingAttendee.motivat`: ticked for the absentees in the meeting form (`motivati`, with `motivatiForm=1`; without that field the saved flags stay), and "Absențe motivate" on the page of a meeting whose type has the COMITET rule (`saveExcusedAction`, `write`, audited, refused on a closed meeting); re-saving the meeting keeps the flag for those still absent. Acasă shows administrators "Statut art. 45 alin. 6 lit. b: 5 absențe nemotivate consecutive" with each member and the meetings of the streak (`committeeAbsences`).
- Export/import: `motivati` on meetings, top-level `comitet` `{ alesLa, sedinta, prelungit }`.

### Minutes (procese-verbale)

- Numbered per year like documents: `lockMeetingRegister` then `nextFreeMeetingNumber` (`src/server/doc-numbering.ts`), unique `(churchId, anRegistru, nr)`. A manual number is checked; meetings saved before numbering have `nr = null` until edited or "Atribuie număr".
- Content: `puncte` (ordered list, sent as JSON in the hidden field `puncte`), `observatii`, `formulaIncheiere`. Each has a rich version (`puncteRich`: one document per point, `observatiiRich`, `formulaRich`), edited with the rich editor and sent in hidden fields of the same names; `meetingSchema` derives the plain fields from them (`minutesFromRich()`), the PDF / Word use the rich ones when present, the audit log adds `formatare` (`minutesFormatting()`). The Word import fills the editor through `plainToRich()`. "Previzualizează" posts the unsaved form to `/pdf/proces-verbal/previzualizare` (`PreviewButton`: a frame beside the form from 820 px, refreshed 1 s after typing stops; a new tab on phones). Export/import: `puncteRich`, `observatiiRich`, `formulaRich` (only documents passing the schema; they decide the plain text). The old `discutii` / `hotarari` were moved there by the `minutes_numbering` migration (`splitDecisions()` in `src/lib/minutes.ts` mirrors it) and stay empty; never write them.
- The PDF follows `docs/samples/proces-verbal-model.md`; `print.test.ts` compares `printToText` with its example line by line. Change both together.
- Signatures: `MeetingSignature` (no `churchId`, reached through Meeting), one per person present. The pad's PNG is re-encoded by `normalizeSignature()` (sharp, ≤ 600×200 px, ≤ 40 KB), also on import.
- `Meeting.locked`: a closed meeting is read-only. Every meeting write checks it on the server (`ActionError`); only `admin` can reopen it. Signing, deleting a signature, closing and reopening are audited (names, never the image).
- Sending: "Trimite" (`write`, `sendMinutesAction` in `src/server/actions/meeting-send.ts`) e-mails one message to the deduplicated recipients (Pastor/Secretar from `Church.pastorEmail`/`secretarEmail` preselected, attendees with an e-mail, free addresses), the PDF attached (≤ 10 MB). Subject and frame are fixed (`framedEmail()`: greeting, fixed lines, signature with the church name, "— trimis din Secretariat Biserică"); only a note of ≤ 1000 characters is the user's (escaped). Each send is a `MeetingSend` row (no `churchId`, created through the meeting; its addresses are shown only to write roles, viewers see "n adrese") and an audit entry with the recipient count only; `sharedRateLimiter("minutes-send")` allows 20 sends per church per hour. Without e-mail configured the button is disabled.
- Page layout ("Așezare în pagină", `/procese-verbale/[id]/asezare`, `write`): format A4/A5, margins, text size, line height, alignment and letterhead (`src/lib/page-layout.ts`). `Meeting.layout` (own, null = default) over `Church.pvLayout` (the church default, saved by `admin`) over `DEFAULT_LAYOUT` (`resolveLayout`); `PrintSpec.layout` is applied by both the PDF and the Word renderer. The preview passes unsaved values as `?previzualizare=1&…` to the PDF/Word routes; `/pdf/**` may be framed by the app itself (`X-Frame-Options: SAMEORIGIN`). A closed meeting's layout is not saved. Audited (`asezare`); exported as `asezare` on meetings.
- `renderMeetingPdf()` / `meetingPdfFileName()` (`src/server/pdf/meeting.ts`) are shared by the PDF route and the e-mail: `PV-<nr>-<AAAA>-<slug>.pdf`. "Partajează" passes that file to the Web Share API, else downloads it.

### Importing old minutes

- `/procese-verbale/import` (`write`): Word files only. `.docx` (≤ 5 MB, ≤ 30 per batch) are read in memory with mammoth (`src/server/minutes-import.ts`) and parsed by `parseMinutesText()` (`src/domain/minutes-parse.ts`, pure; fixtures `docs/samples/*.docx`). Nothing is stored.
- `reviewDraft()` matches names (`matchPersonName`, `src/lib/name-match.ts`; diacritics, case, word order and hyphens ignored): exact name first, then partial (every written word among an active person's words, at least two words). A unique match is an attendee (partial ones listed under "Potriviri de verificat" with "potrivit aproximativ"); the rest are "Nepotriviți" with a picker, candidates first (`resolveImport()` in `src/lib/minutes-import.ts`); unpicked names become guests.
- The review saves through `saveMeetingAction` with the hidden field `import=1`: no redirect (batch "Următorul"), and a taken number falls back to the next free one with a notice.
- Aliases: `PersonAlias` (tenant model; `alias` = `nameKey()`: no diacritics, lower-case, words sorted; unique per church). A "Nepotriviți" name picked by hand is sent in the hidden field `aliasuri` and remembered by `rememberAliases()` (`src/server/person-aliases.ts`) in the meeting's transaction, audited on the person; "Adaugă ca invitat" saves nothing. Matching order: exact name → alias ("potrivit după o alegere anterioară") → partial. Person page: "Alte forme ale numelui" with delete (`write`, audited). Anonymising deletes them. Export/import: `aliases` collection (`src/lib/aliases-backup.ts`).

### Families

- `Family` is a tenant model with a head (`headId`, unique) and members (`Person.familyId`). Families are built from their head in the app ("Fă cap de familie nouă", "Adaugă membri", "Adaugă la familia…"), never from imported text by default.
- Head rule, everywhere (`pickHead()` / `canBeHead()` in `src/lib/families.ts`): never statut Copil or under 18 (a missing birth date counts as adult); Membru > Aparținător > Prieten, then "Cap de familie", then men, then the oldest known birth date. A family of children only has no head. Setting a minor as head is refused on the server (`assertCanBeHead`).
- Membership changes go through `settleFamily()` (`src/server/families.ts`): an empty family is deleted, and a headless one gets a head. The head of a family with other members changes family only after a new head is chosen on `/familii/[id]`. "Dizolvă familia" (`dissolveFamily`) leaves the members without a family; audited.
- `Family.autoCreated`: created by the `families` migration or a text import, default name, never edited. Any edit in the app clears it (`markEdited`). Setări → Date: "Dizolvă familii" (checklist of these families with head and member count, "Selectează tot", confirm with the count; only the checked ones are dissolved, each audited) and "Recalculează capii de familie" act only on these.
- Families of the church (FAMILIES-WITH-MEMBERS): a family with at least one active member (statut MEMBRU, no `dataIesire`, not anonymised) — `isChurchFamily()` / `isActiveMember()` / `churchFamilyIds()` in `src/lib/families.ts`, the only rule (never copied). Used by: `computeStats` (`fams` = church families at the reference date, members by the stats' own `membri`; `famsFaraMembri`, `churchFamilies`), `structure()` (`families.count` / `withoutMembers`, the average and "with minors" over church families), the report line "- N familii", Acasă and Statistici ("familii fără membri" card → `/familii?filtru=fara-membri`, hidden at 0), the statistics PDF / Excel table, `inRotation()` (a family must be a church family; a person without a family must be an active member; PrayerWeek history is kept, the proposal skips units no longer in the rotation) and `/familii` (`FAMILY_FILTERS`: `biserica` default, `fara-membri`, `toate`, in `?filtru=`, counts per filter for the same search, tag "fără membri"). Not changed: family building, kinship, neamuri, the campaign, permissions. Parity: README "Diferențe" 24 (fams + famsFaraMembri = the prototype's number).
- `Person.familieVeche`: the family text of an older file imported with "Nu crea familii din text" (the default); shown on the person page until the person is placed in a family (then cleared).
- Domain records carry `familyId`. `computeStats` and the blessing certificate use it; the parity tests document both deviations.
- Export/import: `families` collection (with `automata`) and `familyId` on members (`src/lib/families-backup.ts`). Members keep the prototype's `familie` text with the family's name.

### Previous / next person

- Persoane list links carry the list query in `?din=` (`src/lib/person-nav.ts`); the person page and the edit form rebuild the same order (`personNeighbors`, alphabetical or by family) and show "‹ Anterior" / "N din M" / "Următorul ›" (`components/person-nav.tsx`, Alt+← / Alt+→). Without `din`: all persons, alphabetical.
- The edit form warns before leaving with unsaved changes (`useUnsavedGuard`: intercepts link clicks, no `beforeunload`); "Salvează și următorul" saves and opens the next person's form.

### Database and migrations

- Never edit an applied migration: Prisma checks its checksum. Add a new migration instead. Example: `note_search` has a wrong backfill, which `note_search_fix` corrects.
- Declare trigram indexes in the schema: `@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)`.
- The seed only recreates the church with id `demo`. Never run it against production: it refuses when `NODE_ENV=production` or the database host is not localhost/127.0.0.1 (`src/lib/seed-guard.ts`) unless `SEED_ALLOW=true`.

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
- Text colours keep 4.5:1 on every background (`--paper`, `--panel`, `--field`, the `-soft` alert / tag colours) in both themes; `src/lib/theme-contrast.test.ts` reads the tokens from globals.css. Links inside running text are underlined.
- Long lists scroll inside their panel instead of stretching the page.
- Names are never cut: no `truncate`, `text-ellipsis`, `line-clamp` or `whitespace-nowrap` (a unit test scans `src/`). "Name + details" rows use `NameRow` (`src/components/ui/name-row.tsx`) or a list row `.item .body` with `.t` (name) and `.m` (details): the details sit at the right when both fit and drop under the name, aligned left, otherwise; both wrap.
- Touch targets are at least 44 px.
- Form rows: `.row2` puts fields side by side only when each column gets ≥ 260 px (`repeat(auto-fit, minmax(min(100%, 260px), 1fr))`), always one column below 600 px; never a fixed `grid-cols-2` for fields. Inputs and selects share one height (min 2.75rem) and shrink (`min-width: 0`). iPhone / iPad Safari date and time fields get the fixes under `@supports (-webkit-touch-callout: none)` in globals.css; `EmptyDateMarker` (root layout) sets `data-empty` so an empty date shows "zz.ll.aaaa".
- No technical jargon in the UI: no "token", "API", "server", environment variable names or error codes.
- Mobile-first: check every change at 390 px width and on desktop, in the light and the dark theme.
- Breakpoints: phone < 600 px (one column), tablet 600–1023 px (`.two` card grids side by side from 600; bottom bar below 820, sidebar from 820 with 16 px main padding up to 1023), desktop ≥ 1024 px (row controls such as `.item-actions` beside the name only from 1024).
- Navigation: below 820 px the bottom bar (`AppNav`: the primary entries and "Mai mult"); from 820 px the sidebar (`SideNav`, `src/components/shell/side-nav.tsx`) with every entry the user may see, grouped by `SIDE_GROUPS` / `sideNav()` (`nav-items.ts`: Principal, Evidență, Rapoarte, Comunitate; an empty group is left out), the list scrolling inside the bar, Setări + text size + Contul meu / Ieșire fixed below; badges from `pendingBadges`, `aria-current` on the active entry. 820–1023 px: narrow (icons; label in `title` and `aria-label`) until "Extinde meniul" (`localStorage` `nav-lata`, try/catch; `html[data-nav-lata]`). `/mai-mult` is the phone's menu: from 820 px it redirects to `/`. A new entry goes into `NAV_ITEMS` and one place of `SIDE_GROUPS` / `SIDE_BOTTOM` (`nav-items.test.ts`). Every button, link-button and field is at least 2.75rem high, `.btn-sm` included.
- Data tables: always `DataTable` (`src/components/ui/data-table.tsx`), never a bare `<table>`. Header cells are sort buttons (`aria-sort`, ≥ 44 px; ▲ / ▼ / both faded); a tap cycles ascending → descending → the table's default (year tables: newest first). Values sort by type (`src/lib/table-sort.ts`: numbers, ISO dates, text with `compareRo`; empty last); footer rows (totals) stay at the bottom. The sort lives in the URL as `?sort=<tableId>.<column>&dir=asc|desc` (set with `replaceState(null, …)` so `useSearchParams` follows), and exports take it: `SortAwareLink` adds it to the PDF / Excel links and the routes pass it to `statisticsTables()` / `statisticsPrint()`; charts stay chronological. On phones the table scrolls inside its card with the header and first column sticky and "Glisați pentru mai multe coloane" until the first swipe. Exception: the per-field review form in De verificat (`.review-table`).
- Text size on screen (A⁻ / A⁺ in "Mai mult", the sidebar footer, Setări → Aspect and Cont → Aspect; `src/components/text-size-control.tsx`): 100 / 115 / 130 %, cookie `text`, `data-text-size` on `<html>` sets the root font size. Font sizes are in rem (never px) so they follow it; at 115 / 130 % lists and buttons wrap instead of truncating and small buttons grow to 44 px. Every screen must fit at 390 px at 130 % (no horizontal scroll).

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
