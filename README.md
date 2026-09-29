# Secretariat Biserică

Aplicație web pentru secretariatul bisericilor: registrul de persoane și familii, procese-verbale,
calendar cu agape, registrul de ieșire al documentelor (adeverințe, certificate, scrisori), darea de
seamă anuală, grupuri și mențiuni. Interfața este integral în limba română, gândită întâi pentru
telefon (meniu jos) și adaptată pentru desktop (bară laterală), cu mod luminos și întunecat.

Aplicația reimplementează într-o arhitectură de producție prototipul
[`prototip/secretariat-biserica.html`](prototip/secretariat-biserica.html), păstrând modelul de date,
calculul statisticilor, șabloanele de documente și darea de seamă. Echivalența este verificată automat
(vezi [Teste](#teste)).

## Funcționalități

| Modul | Ce face |
| --- | --- |
| **Acasă** | Persoane în evidență, membri (%), familii, botezați, aparținători, prieteni nebotezați, copii minori, copii ai membrilor, bărbați/femei, distribuția pe vârste, mișcarea anului, evenimente următoare, aniversări. Selector de an (situație retroactivă) și buton „Dare de seamă”. |
| **Persoane** | Registru complet (statut, familie și grad de rudenie, intrare/botez/binecuvântare/ieșire, slujire, note). Filtre Membri / Toate / Foști, căutare fără diacritice (inclusiv după telefon), paginare, vedere pe familii. Fișa persoanei: familia, grupurile, mențiunile, documentele, istoricul modificărilor. |
| **Procese-verbale** | Tip, dată, oră, loc, președinte, prezenți bifați din registru, invitați, ordinea de zi, discuții, hotărâri. PDF în format oficial. |
| **Calendar** | Vedere lunară (cu ședințele), liste viitoare/trecute, evenimente cu invitat, responsabil, descriere și agapă („cine aduce ce”). |
| **Documente** | Registru de ieșire cu numerotare automată pe an. Textul se generează din datele persoanei și ale bisericii, cu acordurile de gen, este editabil, apoi se salvează și se exportă PDF. |
| **Dare de seamă** | „Situația membrală la 31.12.AAAA” pentru orice an, calculată retroactiv; se salvează ca document în registru. |
| **Grupuri** | Nume, responsabil, descriere, persoane; listă tipăribilă (PDF). |
| **Mențiuni** | Note pe persoană sau familie, vizibile pe fișa persoanei. |
| **Setări** | Datele organizației (antet și semnături), nomenclatoare editabile, utilizatori și roluri (invitații, resetare parolă), export/import JSON compatibil cu prototipul, jurnalul de modificări. |

Toate PDF-urile (documente, procese-verbale, liste de grup, fișe de eveniment, dare de seamă) sunt
generate pe server, cu antetul bisericii și semnăturile pastorului și secretarului.

## Tehnologii

- **Next.js 16** (App Router, Server Components, Server Actions) + **React 19** + **TypeScript**
- **PostgreSQL** + **Prisma 7** (driver `@prisma/adapter-pg`)
- **Auth.js v5** (`next-auth`) — autentificare cu e-mail și parolă, sesiuni JWT
- **Tailwind CSS 4** (tokenurile de design ale prototipului)
- **Zod 4** pentru validarea pe server, **pdfkit** pentru PDF, **Vitest** pentru teste

## Cerințe

- Node.js **22.12+**
- PostgreSQL **14+** cu extensia `pg_trgm` (inclusă în distribuțiile standard; migrarea o activează)

## Instalare (dezvoltare)

```bash
# 1. Dependențe (rulează și `prisma generate`)
npm install

# 2. PostgreSQL local — cu Docker (creează și baza pentru teste) …
docker compose up -d
#    … sau folosiți un server existent și creați bazele `secretariat` și `secretariat_test`.

# 3. Configurare
cp .env.example .env
#    generați AUTH_SECRET:  openssl rand -base64 32   (sau: npx auth secret)

# 4. Schema bazei de date
npx prisma migrate deploy

# 5. Date demo (opțional, recomandat pentru o primă vizită)
npm run db:seed

# 6. Pornire
npm run dev
```

Aplicația rulează la <http://localhost:3000>. Cu datele demo vă puteți autentifica cu:

| Cont | Rol | Parolă |
| --- | --- | --- |
| `admin@demo.ro` | Administrator | `demo1234` |
| `secretar@demo.ro` | Secretar | `demo1234` |
| `vizualizare@demo.ro` | Vizualizare | `demo1234` |

Fără date demo, deschideți `/inregistrare` și creați biserica și contul de administrator
(prima biserică se poate înregistra oricând cât timp baza de date e goală).

## Variabile de mediu

| Variabilă | Obligatorie | Descriere |
| --- | --- | --- |
| `DATABASE_URL` | da | Conexiunea PostgreSQL a aplicației și a migrărilor. |
| `AUTH_SECRET` | da | Cheia de semnare a sesiunilor (min. 32 de caractere aleatoare). |
| `AUTH_TRUST_HOST` | în producție | `true` când aplicația rulează în spatele unui reverse proxy sau cu `next start`. |
| `APP_URL` | recomandat | Adresa publică (ex. `https://secretariat.exemplu.ro`), folosită în linkurile de invitație și resetare a parolei. |
| `ALLOW_SIGNUP` | nu | `true` permite înregistrarea de biserici noi din `/inregistrare`. Implicit doar prima biserică. |
| `APP_TIME_ZONE` | nu | Fusul orar pentru „azi” (implicit `Europe/Bucharest`; ex. `Europe/Oslo`). |
| `TEST_DATABASE_URL` | pentru teste | Baza de date (separată!) pentru testele de integrare; fără ea sunt sărite. |

## Migrări Prisma

Schema este în [`prisma/schema.prisma`](prisma/schema.prisma), migrările în `prisma/migrations/`,
configurația în [`prisma.config.ts`](prisma.config.ts) (Prisma 7 citește `.env` prin `dotenv`).

| Comandă | Când |
| --- | --- |
| `npx prisma migrate deploy` (`npm run db:deploy`) | Aplică migrările existente — la instalare și la fiecare deploy în producție. |
| `npx prisma migrate dev --name <nume>` (`npm run db:migrate`) | În dezvoltare, după modificarea schemei: creează și aplică o migrare nouă. |
| `npx prisma generate` (`npm run db:generate`) | Regenerează clientul (`src/generated/prisma`, nu se comite). Rulează automat la `npm install`. |
| `npm run db:seed` | Încarcă biserica demo. Idempotent: recreează doar biserica cu id-ul `demo`. |
| `npm run db:reset` | **Șterge toată baza de date** și o recreează (doar în dezvoltare). |

Prima migrare activează `pg_trgm` și creează indexuri trigram pentru căutarea rapidă. Pe servere
administrate unde utilizatorul aplicației nu poate crea extensii, rulați o singură dată ca
administrator: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`.

## Roluri

| Rol | Poate |
| --- | --- |
| **Administrator** | Tot: date, setările organizației, nomenclatoare, utilizatori și roluri, import. Biserica are mereu cel puțin un administrator activ. |
| **Secretar** | Adaugă, modifică și șterge în registre, emite documente, exportă datele, consultă jurnalul. |
| **Vizualizare** | Consultă și tipărește (PDF), inclusiv darea de seamă, fără a o înregistra. |

Utilizatorii noi sunt invitați din **Setări → Utilizatori**: se generează un link personal (valabil
7 zile) pe care administratorul îl trimite persoanei invitate. Tot de acolo se generează linkuri de
resetare a parolei, se schimbă rolul sau se dezactivează un cont (sesiunile deschise se închid imediat).

## Teste

```bash
npm test               # unitare + integrare (integrarea necesită TEST_DATABASE_URL)
npm run test:watch     # mod interactiv
```

- **Paritate cu prototipul** ([`tests/unit/prototype-parity.test.ts`](tests/unit/prototype-parity.test.ts)):
  extrage funcțiile originale `stats`, `reportText` și `genDocText` din fișierul HTML al prototipului,
  le rulează într-un context izolat și compară rezultatele cu implementarea aplicației pe sute de
  registre generate aleator (seed fix): statisticile sunt identice, darea de seamă identică caracter cu
  caracter, iar textele documentelor identice pentru peste o mie de combinații de tip/persoană/câmpuri.
- **Statistici și dare de seamă** ([`src/domain/stats.test.ts`](src/domain/stats.test.ts),
  [`src/domain/report.test.ts`](src/domain/report.test.ts)): scenarii explicite — situația la zi și
  retroactivă, vârste la data situației, copii ai membrilor, mișcarea anului, formatul complet al textului.
- **Documente, tipărituri, PDF, validări, import/export, parole, blocarea autentificării.**
- **Integrare pe PostgreSQL** (`tests/integration`): izolarea datelor între biserici și numerotarea
  concurentă a registrului de documente. Baza indicată de `TEST_DATABASE_URL` este golită la rulare.

## Working model

- **Branches:**
  - Development happens on the `dev` branch.
  - `main` is production. Only the owner updates it, with fast-forward merges.
  - Before each merge, the owner creates a `backup-<branch>-<YYYY-MM-DD>` branch.
- **Checks:** every commit passes `npm run check` (lint, typecheck, unit and integration tests, production build). CI runs the same command.
- **Documentation:**
  - [`CLAUDE.md`](CLAUDE.md): conventions, commit format (`MARKER: subject`), language rules and UI rules.
  - [`docs/ROADMAP.md`](docs/ROADMAP.md): current state, decisions and next steps.

## Producție

```bash
npm ci
npx prisma migrate deploy
npm run build
npm start          # sau în spatele unui reverse proxy (nginx, Caddy) cu HTTPS
```

- Setați `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `APP_URL` și `DATABASE_URL`.
- Fonturile folosite în PDF-uri sunt în `assets/fonts/` (Source Serif 4, licență OFL) și sunt incluse
  automat în build; directorul de lucru al procesului trebuie să fie rădăcina proiectului.
- Copii de siguranță: `pg_dump` pentru întreaga bază, iar pentru o singură biserică exportul JSON din
  **Setări → Copie de siguranță**.
- Autentificarea blochează temporar (15 minute) un cont după 5 parole greșite consecutive.

## Deploy on Render

[`render.yaml`](render.yaml) is a Render Blueprint. It creates:

- the web service **secretariat-biserica**: Node 22, Starter plan, Frankfurt, deploying from `dev` for now;
- the PostgreSQL 16 database **secretariat-db**: plan `basic-256mb`, the smallest paid instance type, reachable only from Render's private network.

| | Command |
| --- | --- |
| Build | `npm ci && npx prisma generate && npm run build` |
| Start | `npx prisma migrate deploy && npm run start` |

`/api/health` is Render's health check. It answers `{"ok":true,"db":true}` with HTTP 200, or HTTP 503 when the database does not answer.

1. **Create the Blueprint.** In the Render dashboard choose **New → Blueprint**, then pick the repository `adriancus-coder/secretariat-biserica` and the branch `dev`.
2. **Fill in the variables Render asks for** (`sync: false` in `render.yaml`):

   | Variable | Value |
   | --- | --- |
   | `APP_URL` | The public address. A new service gets `https://<service-name>.onrender.com`; if the exact URL is not known yet, set it right after the first deploy. Links in e-mails are built from it. |
   | `RESEND_API_KEY` | A Resend API key with sending access. Leave it empty to start without e-mail: invitation and password-reset links are then copied manually from Setări → Utilizatori. |
   | `EMAIL_FROM` | Optional. The default is `Secretariat Biserică <secretariat@sanctuaryvoice.com>`; the sender's domain must be verified in Resend. |
   | `ALLOW_SIGNUP` | `true`, only for the first setup (step 4). |

   Render sets the rest itself:
   - `DATABASE_URL` comes from the database;
   - `AUTH_SECRET` is generated;
   - `AUTH_TRUST_HOST=true`;
   - `APP_TIME_ZONE=Europe/Oslo`;
   - `NODE_VERSION=22`.
3. **Apply.** Render creates the database, builds, runs the migrations and starts the app. Check that `https://<your-app>/api/health` returns `{"ok":true,"db":true}`.
4. **Create the first administrator.** Open `/inregistrare` and register the church (Maranata Stavanger) and your admin account.
   - Then, in the service's **Environment** tab, delete `ALLOW_SIGNUP` (or set it to `false`) and save. Render redeploys.
   - Do this right after the first deploy: while the database is empty, anyone who opens `/inregistrare` can register the first church.
5. **Finish the setup in the app.**
   - In Setări, fill in the organisation data (address, pastor, secretar), which is used in the PDF letterhead and signatures.
   - Invite the other users from Setări → Utilizatori.

Notes:

- **Extension `pg_trgm`.** The first migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
  - `pg_trgm` is a trusted extension (PostgreSQL 13+), so a database owner without superuser rights can create it. That matches the Render database user.
  - This was verified locally: all migrations applied with such a role.
  - If a deploy log still shows `permission denied to create extension`, open the database's page in Render, connect with its **PSQL command**, run `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and redeploy.
- **Do not set `NODE_ENV=production`** as an environment variable. `npm ci` would then skip the devDependencies that the build and `prisma migrate deploy` need. `next start` sets production mode by itself.
- **Never run `npm run db:seed` against the production database**: it is for the demo church.
- **Backups.** Render keeps database backups for paid instance types. Each church can also download its JSON copy from Setări → Copie de siguranță.
  - `ipAllowList: []` keeps the database private. To run `pg_dump` from your own machine, temporarily allow your IP address in the database's settings.
- **Going live from `main`.** When production should follow `main`, change `branch: dev` to `branch: main` in `render.yaml`, or change the branch in the service settings.
- **Custom domain.** After adding a custom domain in Render, update `APP_URL`.

## Arhitectură

```
prototip/                 prototipul HTML (specificația de referință)
prisma/                   schema, migrări, seed demo
assets/fonts/             fonturile încorporate în PDF-uri
src/
  app/(auth)/             autentificare, înregistrare, invitații, resetare parolă
  app/(app)/              paginile aplicației (Acasă, Persoane, Calendar, Ședințe, …)
  app/pdf/                rute care generează PDF-uri
  app/api/                Auth.js, export JSON, verificarea stării (/api/health)
  domain/                 logică pură, testată: statistici, dare de seamă, șabloane, tipărituri, backup
  lib/                    formatări, etichete, validări (zod), utilitare comune server/client
  server/                 acces la date (queries), acțiuni (actions), sesiune, audit, PDF
  components/             componente de interfață
tests/                    teste de paritate cu prototipul și de integrare
```

- **Izolarea bisericilor.** Fiecare înregistrare are `churchId`. Toate interogările trec prin
  `tenantDb(churchId)` ([`src/server/tenant-scope.ts`](src/server/tenant-scope.ts)), o extensie Prisma
  care adaugă automat condiția pe biserică la citiri, modificări și ștergeri și setează biserica la
  creare. `churchId` provine întotdeauna din sesiunea verificată, niciodată din formular. Referințele
  primite din formulare (prezenți, membri de grup, persoana unui document) sunt verificate că aparțin
  aceleiași biserici.
- **Sesiuni.** Auth.js emite un JWT; la fiecare cerere utilizatorul este reîncărcat din baza de date
  (cont activ, rol curent, versiunea sesiunii). Schimbarea parolei sau dezactivarea contului invalidează
  sesiunile existente. `proxy.ts` doar redirecționează vizitatorii neautentificați; autorizarea se face
  în fiecare pagină, acțiune de server și rută.
- **Validare.** Toate acțiunile validează pe server cu zod (mesaje în română); erorile sunt afișate lângă
  câmpuri, iar formularele nu pierd datele introduse.
- **Jurnal de modificări.** Adăugările, modificările (cu diferențele pe câmpuri) și ștergerile de
  persoane, documente, ședințe, evenimente, grupuri, mențiuni, setări, utilizatori și importurile se
  înregistrează în aceeași tranzacție cu modificarea.
- **Căutare și ordonare.** Coloane derivate: `searchText` (fără diacritice, cu index trigram) și
  `sortKey` (ordinea alfabetului românesc: A, Ă, Â, …, S, Ș, T, Ț), independente de colaționarea serverului.
- **Numerotarea documentelor** este serializată pe (biserică, an) cu un advisory lock PostgreSQL, iar
  unicitatea e garantată și de un index unic.

## Diferențe față de prototip

Logica prototipului este păstrată întocmai (verificat prin testele de paritate), cu următoarele
corecții deliberate:

1. **Situația retroactivă.** Prototipul excludea din anii trecuți orice persoană adăugată în aplicație
   după acel an, chiar dacă avea o dată de intrare anterioară — un registru introdus acum ar fi dat
   dări de seamă goale pentru anii trecuți. Aici data intrării are prioritate; data înregistrării se
   folosește doar pentru persoanele fără dată de intrare. Persoanele născute după data situației nu sunt
   numărate.
2. **Filtrul „Membri”** nu mai include persoanele ieșite din evidență (de ex. decedate, care își păstrau
   statutul de „Membru”).
3. **Aniversări:** se afișează vârsta împlinită în acest an (prototipul adăuga un an în plus după ziua
   de naștere).
4. **Certificatul de binecuvântare** nu mai trece persoana însăși printre părinți.
5. **Numerotarea documentelor** se face pe anul din data documentului (nu pe anul curent), automat la
   salvare, fără dubluri; un număr introdus manual este verificat.
6. **Editarea unui document existent** nu suprascrie automat textul salvat la schimbarea persoanei sau a
   tipului (se folosește „Regenerează din șablon”); titlul din registru se actualizează automat până la
   prima modificare manuală.
7. **Editarea unei ședințe sau a unui grup** păstrează persoanele bifate care între timp au ieșit din
   evidență (prototipul le pierdea la salvare).
8. **Selectorul de an** din tabloul de bord afișează și statistica retroactivă a anului ales, nu doar
   darea de seamă; mișcarea anului include și reprimirile.
9. **Listele de nume din darea de seamă** sunt în ordine alfabetică (în prototip, ordinea introducerii).
10. **„Azi”** se calculează în fusul orar configurat (`APP_TIME_ZONE`), nu în UTC.
11. **Importul** este validat și atomic: fișierele cu erori nu modifică nimic, id-urile care aparțin
    altei biserici primesc id-uri noi, iar documentele fără număr sau cu număr dublu sunt renumerotate.

## Limitări și pași următori

Limitările cunoscute și pașii următori, în ordinea priorității, sunt în [`docs/ROADMAP.md`](docs/ROADMAP.md).
