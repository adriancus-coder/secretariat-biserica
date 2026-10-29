import { GeneratedActions } from "@/components/generated/generated-actions";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { PageHead } from "@/components/ui/page-head";
import { NameRow } from "@/components/ui/name-row";
import { ageKey } from "@/domain/categories";
import { AGE_BANDS, percentOf } from "@/domain/stats";
import { categoryHref } from "@/lib/category-params";
import { addDays, ageAt, dotDateTime, fromDbDate, monthsBefore, todayIso, toDbDate } from "@/lib/dates";
import { fmt, fmtShort, memberName, MONTHS_L } from "@/lib/format";
import { isGeneralAssembly, ordinaryAssemblyMissing } from "@/lib/general-assembly";
import { permissions } from "@/lib/permissions";
import { APPEAL_DAYS, appealDeadline } from "@/lib/discipline-print";
import { mandateNotice } from "@/lib/committee";
import { inventoryReminder } from "@/lib/patrimony";
import { eventsWaitingForRegister } from "@/server/queries/event-persons";
import { IgnoreRegisterButton } from "./calendar/[id]/register-card";
import { photoQuotaText } from "@/lib/asset-photos";
import { assemblyCard, birthdaysCard, mandateCard, type DashCard, disciplineAccessCard } from "@/lib/pastor-dashboard";
import { PastorDashboard } from "@/components/pastor-dashboard";
import { committeeAbsences } from "@/server/queries/committee";
import { getChurch } from "@/server/queries/church";
import { committee as loadCommittee } from "@/server/queries/roles";
import { loadStats } from "@/server/queries/stats";
import { redirect } from "next/navigation";
import { requireCtx, requireUser } from "@/server/session";
import { deleteExpiredContactsAction } from "@/server/actions/statute";
import { expiredContactWhere } from "@/server/retention";
import { loadConsentStates } from "@/server/consents";
import { daysSinceLastExport, EXPORT_REMINDER_DAYS, exportAgeText } from "@/server/queries/export-reminder";
import { ChurchFamiliesStat } from "@/components/church-families-stat";
import { OTHER_CHILDREN_HINT, OTHER_CHILDREN_LABEL, PRIETENI_LABEL } from "@/lib/labels";

/** A bar whose number opens the list of persons behind it. */
function Bar({ label, n, width, warn, href }: { label: string; n: number; width: number; warn?: boolean; href?: string }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div className="track">
        <span style={{ width: `${width}%`, background: warn ? "var(--warn)" : undefined }} />
      </div>
      {href ? (
        <Link href={href} className="stat-link" aria-label={`${label}: ${n} — vezi lista`}>
          <em>{n}</em>
        </Link>
      ) : (
        <em>{n}</em>
      )}
    </div>
  );
}

/** A figure; with `href` it opens the exact list of persons it counts. */
function Stat({ value, label, href, warn, title }: { value: React.ReactNode; label: React.ReactNode; href?: string; warn?: boolean; title?: string }) {
  return href ? (
    <Link href={href} className={`stat stat-link${warn ? " stat-warn" : ""}`} title={title}>
      <b>{value}</b>
      <span>{label}</span>
    </Link>
  ) : (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  // The "Rugăciune" role has no Acasă (register figures): its home is the family of the week.
  if (!permissions.read(await requireUser())) redirect("/rugaciune");
  const ctx = await requireCtx();
  const sp = await searchParams;
  const church = await getChurch(ctx);
  const requested = Number(typeof sp.an === "string" ? sp.an : NaN);
  const currentYear = Number(todayIso().slice(0, 4));
  const year = Number.isInteger(requested) && requested > 1800 && requested <= currentYear + 1 ? requested : undefined;

  const { stats: s, persons, years, today } = await loadStats(ctx, year);
  const selectedYear = year ?? Number(today.slice(0, 4));
  const yearOptions = years.includes(selectedYear) ? years : [selectedYear, ...years];
  const maxBand = Math.max(1, ...s.bands.map(([, n]) => n));
  const move = (n: number) => Math.min(100, n * 10);
  // Every figure opens its list, computed for the same year as here (`an` only when one was chosen).
  const cat = (key: string) => categoryHref(key, year);

  const committee = await loadCommittee(ctx);
  const upcoming = await ctx.db.event.findMany({
    where: { data: { gte: toDbDate(today)! } },
    orderBy: [{ data: "asc" }, { ora: "asc" }],
    take: 5,
    select: { id: true, titlu: true, data: true, ora: true },
  });
  const month = today.slice(5, 7);
  const canWrite = permissions.write(ctx.user.role);
  // Only persons who agreed to have their birthday announced; write roles can show all ("fără acord").
  const allBirthdays = persons
    .filter((p) => p.dataNasterii && p.dataNasterii.slice(5, 7) === month && !p.dataIesire)
    .sort((a, b) => a.dataNasterii!.slice(8).localeCompare(b.dataNasterii!.slice(8)));
  const birthdayConsent = await loadConsentStates(ctx, allBirthdays.map((p) => p.id));
  const agreed = (id: string) => birthdayConsent.get(id)?.BIRTHDAY === "DA";
  const showAllBirthdays = canWrite && sp.aniversari === "toti";
  const birthdays = allBirthdays.filter((p) => showAllBirthdays || agreed(p.id));
  // Statut art. 23 alin. 4–5: away for more than 3 months; after 6 the transfer must be asked for.
  const away = (months: number) => persons.filter((p) => !p.dataIesire && p.plecatDin && p.plecatDin <= monthsBefore(today, months)).length;
  const away3 = away(3);
  const away6 = away(6);
  // Privacy notice point 6: contact data of persons who left more than 12 months ago (administrators).
  const expiredContacts = permissions.admin(ctx.user.role)
    ? await ctx.db.person.findMany({ where: expiredContactWhere(), orderBy: [{ sortKey: "asc" }, { id: "asc" }], select: { id: true, nume: true, prenume: true } })
    : [];
  // Administrators are reminded of the monthly JSON export (backup policy, docs/SECURITY.md).
  const exportDays = permissions.admin(ctx.user.role) ? await daysSinceLastExport(ctx) : undefined;
  const exportDue = exportDays !== undefined && (exportDays === null || exportDays > EXPORT_REMINDER_DAYS);
  // Statut art. 46 alin. 3: the ordinary General Assembly every year; reminded from 1 October.
  let agMissing = false;
  if (canWrite && Number(today.slice(5, 7)) >= 10) {
    const y = today.slice(0, 4);
    const held = await ctx.db.meeting.findMany({
      where: { data: { gte: toDbDate(`${y}-01-01`)!, lte: toDbDate(`${y}-12-31`)! }, OR: [{ tipAG: null }, { tipAG: "ORDINARA" }] },
      select: { tip: true },
    });
    agMissing = ordinaryAssemblyMissing(today, held.filter((m) => isGeneralAssembly(m.tip, church.tipuriAG)).length);
  }
  // Statut art. 45: the committee's mandate (write roles) and 5 unexcused absences in a row (administrators).
  const mandate = canWrite ? mandateNotice(today, church.comitetAlesLa, church.comitetPrelungit) : null;
  // PATRIMONY (Statut art. 43 alin. 7): once a year, in November before the General Assembly (write roles).
  const inventory = canWrite ? inventoryReminder(today) : null;
  // EVENT-PERSONS: events taken place whose register data wait for „Trece în registru” (write roles).
  const registerEvents = canWrite ? await eventsWaitingForRegister(ctx) : [];
  // PATRIMONY-PHOTOS: with the reminder, the space the photos use (administrators).
  const photoSpace = inventory && permissions.admin(ctx.user.role) ? photoQuotaText((await ctx.db.assetPhoto.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? 0) : null;
  const absences = permissions.admin(ctx.user.role) ? await committeeAbsences(ctx, church) : [];
  // Administrators only (`disciplina`): open appeal windows (Statut art. 27 alin. 11) and pending appeals.
  const appeals = permissions.disciplina(ctx.user)
    ? (
        await ctx.db.disciplinaryMeasure.findMany({
          where: {
            stare: "APLICATA",
            contestatieRezultat: null,
            OR: [{ comunicatLa: { gte: toDbDate(addDays(today, -APPEAL_DAYS))! } }, { comunicatLa: { not: null }, contestatieLa: { not: null } }],
          },
          orderBy: { comunicatLa: "asc" },
          select: { id: true, personId: true, comunicatLa: true, contestatieLa: true, person: { select: { nume: true, prenume: true } } },
        })
      ).map((m) => ({ ...m, deadline: appealDeadline(fromDbDate(m.comunicatLa)!) }))
    : [];
  // Policy "parolă + Face ID / amprentă": every sign-in with a backup code in the last 30 days (administrators).
  const recoverySignIns = permissions.admin(ctx.user.role)
    ? await ctx.db.auditLog.findMany({
        where: { entity: "SECURITY", createdAt: { gte: toDbDate(addDays(today, -30))! }, changes: { path: ["intrareRezerva"], string_contains: "cod" } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, userName: true, createdAt: true },
      })
    : [];
  // The pastor's queue (Statut art. 39): documents waiting for approval and signature.
  const isPastor = permissions.pastor(ctx.user);
  const toSign = isPastor ? await ctx.db.document.count({ where: { stare: "DE_SEMNAT" } }) : 0;
  // The pastor's cards (they replace the separate notices for pastors).
  let pastorCards: DashCard[] = [];
  if (isPastor) {
    const y = today.slice(0, 4);
    const [proposedApps, proposedPersons, openMeasures, assemblies, withAccess] = await Promise.all([
      ctx.db.application.count({ where: { status: "PROPUSA" } }),
      ctx.db.personProposal.count({ where: { status: "PROPUSA" } }),
      ctx.db.disciplinaryMeasure.count({ where: { stare: { in: ["CERCETARE", "APLICATA"] } } }),
      ctx.db.meeting.findMany({
        // Held this year: up to today (a meeting entered ahead is not held yet).
        where: { data: { gte: toDbDate(`${y}-01-01`)!, lte: toDbDate(today)! }, OR: [{ tipAG: null }, { tipAG: "ORDINARA" }] },
        select: { tip: true, data: true },
      }),
      ctx.db.user.findMany({
        where: { accesDisciplina: true, isPastor: false, active: true, role: { in: ["ADMIN", "SECRETAR"] } },
        orderBy: { name: "asc" },
        select: { name: true },
      }),
    ]);
    const toApprove = proposedApps + proposedPersons;
    const nextAppeal = appeals.find((a) => !a.contestatieLa);
    pastorCards = [
      { title: "Documente de semnat", value: String(toSign), detail: toSign ? "trimise de secretariat" : "nimic de semnat", href: "/documente/de-semnat", alert: toSign > 0 },
      {
        title: "Cereri de aprobat",
        value: String(toApprove),
        detail: toApprove ? [proposedApps ? `${proposedApps} de membru` : "", proposedPersons ? `${proposedPersons} reabilitări / excluderi` : ""].filter(Boolean).join(", ") : "nimic în așteptare",
        href: "/cereri?stare=propuse",
        alert: toApprove > 0,
      },
      {
        title: "Măsuri disciplinare deschise",
        value: String(openMeasures),
        detail: nextAppeal ? `contestare: ${memberName(nextAppeal.person)} până la ${fmt(nextAppeal.deadline)}` : appeals.length ? `${appeals.length} contestații fără rezultat` : "niciun termen de contestare",
        href: "/disciplina",
        alert: appeals.length > 0,
      },
      { title: "Acces la disciplină", ...disciplineAccessCard(withAccess.map((u) => u.name)), href: "/setari/utilizatori#acces-disciplina" },
      { title: "Plecați de peste 3 luni", value: String(away3), detail: away6 ? `${away6} de peste 6 luni (transferul)` : "niciunul de peste 6 luni", href: categoryHref(away6 ? "plecati-6-luni" : "plecati-3-luni", undefined), alert: away6 > 0 },
      { title: `Aniversări în ${MONTHS_L[Number(month) - 1]}`, ...birthdaysCard(today, allBirthdays.filter((p) => agreed(p.id)).map((p) => ({ name: memberName(p), dataNasterii: p.dataNasterii! }))), href: "#aniversari" },
      { title: "Mandatul comitetului", ...mandateCard(today, church.comitetAlesLa, church.comitetPrelungit), href: categoryHref("comitet", undefined) },
      {
        title: `Adunarea Generală ${y}`,
        ...assemblyCard(today, assemblies.filter((m) => isGeneralAssembly(m.tip, church.tipuriAG)).map((m) => fromDbDate(m.data)!)),
        href: "/procese-verbale",
      },
    ];
  }

  return (
    <>
      <PageHead
        title={church.nume}
        sub={year && s.endDate !== today ? `Situația la ${fmt(s.endDate)} (retroactiv)` : `Situația la ${fmt(today)}`}
      />

      {pastorCards.length ? <PastorDashboard cards={pastorCards} /> : null}
      {toSign && !isPastor ? (
        <div className="alert mb-4" role="status">
          <Link href="/documente/de-semnat">
            {toSign === 1 ? "Un document așteaptă" : `${toSign} documente așteaptă`} aprobarea și semnătura dumneavoastră
          </Link>{" "}
          <span className="badge">{toSign}</span>
        </div>
      ) : null}
      {recoverySignIns.length ? (
        <div className="alert mb-4" role="status">
          {recoverySignIns.map((r) => (
            <div key={r.id}>
              Intrare cu cod de rezervă: {r.userName}, {dotDateTime(r.createdAt)}
            </div>
          ))}
        </div>
      ) : null}
      {appeals.length && !isPastor ? (
        <div className="alert mb-4" role="status">
          <p className="m-0">Termene de contestare la Comunitate (Statut art. 27 alin. 11):</p>
          <ul className="m-0 mt-1 pl-5 list-disc">
            {appeals.map((a) => (
              <li key={a.id}>
                <Link href={`/persoane/${a.personId}/disciplina`}>{memberName(a.person)}</Link>:{" "}
                {a.contestatieLa ? `contestație depusă la ${fmt(fromDbDate(a.contestatieLa)!)}, fără rezultat` : `până la ${fmt(a.deadline)}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {registerEvents.length ? (
        <div className="alert mb-4" role="status">
          <p className="m-0">Evenimente cu date de trecut în registru ({registerEvents.length}):</p>
          <ul className="m-0 mt-1 pl-0 list-none">
            {registerEvents.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center gap-2 mt-1">
                <Link href={`/calendar/${ev.id}#registru-title`}>
                  {ev.titlu} ({fmt(ev.data)})
                </Link>
                <IgnoreRegisterButton eventId={ev.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {inventory ? (
        <div className="alert mb-4" role="status">
          {inventory} <Link href="/patrimoniu">Patrimoniu</Link>
          {photoSpace ? <span className="block">{photoSpace}.</span> : null}
        </div>
      ) : null}
      {mandate && !isPastor ? (
        <div className="alert mb-4" role="status">
          {mandate} <Link href="/setari">Setări</Link>
        </div>
      ) : null}
      {absences.length ? (
        <div className="alert mb-4" role="status">
          <p className="m-0">Statut art. 45 alin. 6 lit. b: 5 absențe nemotivate consecutive la ședințele comitetului.</p>
          <ul className="m-0 mt-1 pl-5 list-disc">
            {absences.map((a) => (
              <li key={a.id}>
                <Link href={`/persoane/${a.id}`}>{a.name}</Link> ({a.count}):{" "}
                {a.meetings.map((m, i) => (
                  <span key={m.id}>
                    {i ? ", " : ""}
                    <Link href={`/procese-verbale/${m.id}`}>{m.label}</Link>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {agMissing && !isPastor ? (
        <div className="alert mb-4" role="status">
          Adunarea Generală ordinară nu a avut loc în {today.slice(0, 4)} (Statut art. 46 alin. 3).{" "}
          <Link href="/procese-verbale/nou">Ședință nouă</Link>
        </div>
      ) : null}
      {away3 && !isPastor ? (
        <div className="alert mb-4" role="status">
          <Link href={categoryHref("plecati-3-luni", undefined)}>{away3} plecați de peste 3 luni</Link>
          {away6 ? (
            <>
              {" · "}
              <Link href={categoryHref("plecati-6-luni", undefined)}>{away6} de peste 6 luni (trebuie cerut transferul)</Link>
            </>
          ) : null}
          {" "}— Statut art. 23 alin. 4–5.
        </div>
      ) : null}
      {expiredContacts.length ? (
        <div className="card mb-4">
          <h3>Date de contact de șters (ieșiți de peste 12 luni)</h3>
          <p className="hint mb-2">
            Telefonul, e-mailul și adresa se șterg; datele de registru rămân (Statut art. 14 alin. 3 lit. a).
          </p>
          <ul className="list scroll-panel mb-3">
            {expiredContacts.map((p) => (
              <li key={p.id}>
                <Link href={`/persoane/${p.id}`} className="item">
                  {memberName(p)}
                </Link>
              </li>
            ))}
          </ul>
          <form action={deleteExpiredContactsAction}>
            <button type="submit" className="btn">
              Șterge acum ({expiredContacts.length})
            </button>
          </form>
        </div>
      ) : null}
      {exportDue ? (
        <div className="alert mb-4" role="status">
          {exportAgeText(exportDays ?? null)} Descărcați o copie de siguranță a datelor din{" "}
          <Link href="/setari/date">Setări → Copie de siguranță</Link>.
        </div>
      ) : null}
      <div className="stats">
        {/* GENDER-AGE-FILTERS: the men / women split under the total, one line each, to the filtered list. */}
        <div className="stat stat-families stat-record">
          <Link href={cat("toti")} className="stat-main">
            <b>{s.ev.length}</b>
            <span>persoane în evidență</span>
          </Link>
          <Link href={categoryHref("toti", year, { gen: "M" })} className="stat-line" aria-label={`${s.gen.M} bărbați — vezi lista`}>
            {s.gen.M} bărbați
          </Link>
          <Link href={categoryHref("toti", year, { gen: "F" })} className="stat-line" aria-label={`${s.gen.F} femei — vezi lista`}>
            {s.gen.F} femei
          </Link>
        </div>
        <Stat value={s.membri.length} label={`membri · ${percentOf(s.membri.length, s.ev.length)}%`} href={cat("membri")} />
        <ChurchFamiliesStat count={s.fams} others={s.famsFaraMembri} />
      </div>
      <div className="stats">
        <Stat value={s.botezati.length} label="botezați" href={cat("botezati")} />
        <Stat value={s.apart.length} label="aparținători" href={cat("apartinatori")} />
        <Stat value={s.prieteni.length} label={PRIETENI_LABEL} href={cat("prieteni")} />
      </div>
      <div className="stats">
        <Stat value={s.apartA.length} label="aparținători a) minori din familii de credincioși" href={cat("apartinatori-a")} />
        <Stat value={s.apartB.length} label="aparținători b) nebotezați hotărâți" href={cat("apartinatori-b")} />
        <Stat value={s.botezatiFara.length} label="botezați fără calitate de membru" href={cat("botezati-fara-calitate")} />
      </div>
      <div className="stats">
        <Stat value={s.copii.length} label="copii minori" href={cat("copii-minori")} />
        <Stat value={s.copiiMembri.length} label="copii ai membrilor" href={cat("copii-membri")} />
        <Stat value={s.copiiAlte.length} label={OTHER_CHILDREN_LABEL} href={cat("copii-alte")} title={OTHER_CHILDREN_HINT} />
      </div>
      {/* Marital status of the adults in the record: the three add up to the adults. */}
      <div className="stats mb-4">
        <Stat value={s.casatoriti.length} label="căsătoriți" href={cat("casatoriti")} />
        <Stat value={s.necasatoriti.length} label="necăsătoriți" href={cat("necasatoriti")} />
        <Stat value={s.stareCivilaNecompletata.length} label="stare civilă necompletată" href={cat("stare-civila-necompletata")} warn={s.stareCivilaNecompletata.length > 0} />
      </div>

      <div className="two">
        <div className="card">
          <h3>Anul {s.y}</h3>
          <div className="bars">
            <Bar label="Botezați" n={s.intrBotez.length} width={move(s.intrBotez.length)} href={cat("intrati-botez")} />
            <Bar label="Transferați" n={s.intrTransfer.length} width={move(s.intrTransfer.length)} href={cat("intrati-transfer")} />
            <Bar label="Reabilitați" n={s.reprimiri.length} width={move(s.reprimiri.length)} href={cat("reprimiti")} />
            <Bar label="Binecuv." n={s.binecuv.length} width={move(s.binecuv.length)} href={cat("binecuvantati")} />
            <Bar label="Ieșiri" n={s.iesiri.length} width={move(s.iesiri.length)} warn href={cat("iesiti-an")} />
          </div>
          <form method="get" className="flex gap-2 items-center mt-3 flex-wrap">
            <label htmlFor="an" className="sr-only">
              Anul
            </label>
            <AutoSubmitSelect id="an" name="an" defaultValue={String(selectedYear)} className="!w-auto !py-1.5">
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </AutoSubmitSelect>
            <noscript>
              <button type="submit" className="btn btn-sm">
                Arată
              </button>
            </noscript>
            {canWrite ? (
              <Link href={`/documente/nou?tip=raport&an=${selectedYear}`} className="btn btn-primary btn-sm" prefetch={false}>
                Dare de seamă {selectedYear}
              </Link>
            ) : (
              <GeneratedActions ctx={ctx} kind="dare-de-seama" params={{ an: String(selectedYear) }} fileName={`dare-de-seama-${selectedYear}`} className="btn btn-primary btn-sm" label={`Dare de seamă ${selectedYear}`} />
            )}
          </form>
        </div>

        <div className="card">
          <h3>Vârste</h3>
          <div className="bars">
            {s.bands.map(([label, n], i) => (
              <Bar key={label} label={AGE_BANDS[i][0]} n={n} width={(n / maxBand) * 100} href={cat(ageKey(AGE_BANDS[i][1], AGE_BANDS[i][2]))} />
            ))}
          </div>
          <div className="hint mt-2">
            <Link href={cat("fara-data-nasterii")}>{s.ev.filter((p) => !p.dataNasterii).length} persoane fără dată de naștere</Link>
          </div>
        </div>

        {committee.length ? (
          <div className="card">
            <h3>Comitetul</h3>
            <ul>
              {committee.map((m) => (
                <li key={m.id}>
                  <Link href={`/persoane/${m.id}`} className="name-link">
                    <NameRow name={m.name} detail={m.roles.join(", ")} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="card">
          <h3>Evenimente următoare</h3>
          {upcoming.length ? (
            <ul>
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={`/calendar/${e.id}`} className="name-link">
                    <NameRow lead={<b className="inline-block w-[3.75rem] font-serif">{fmtShort(e.data.toISOString().slice(0, 10))}</b>} name={e.titlu} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hint">Nimic programat.</div>
          )}
        </div>

        <div className="card" id="aniversari">
          <h3>Aniversări în {MONTHS_L[Number(month) - 1]}</h3>
          <p className="hint mb-2">
            {showAllBirthdays ? "Toate persoanele; cele fără acord sunt marcate." : "Doar persoanele care au fost de acord să li se anunțe ziua de naștere."}{" "}
            {canWrite ? (
              <Link href={showAllBirthdays ? "/" : "/?aniversari=toti"}>{showAllBirthdays ? "Doar cu acord" : `Arată toți (${allBirthdays.length})`}</Link>
            ) : null}
          </p>
          {birthdays.length ? (
            <ul>
              {birthdays.map((p) => (
                <li key={p.id}>
                  <Link href={`/persoane/${p.id}`} className="name-link">
                    <NameRow
                      lead={<b className="inline-block w-[2.25rem] font-serif">{Number(p.dataNasterii!.slice(8))}</b>}
                      name={
                        <>
                          {memberName(p)}
                          {showAllBirthdays && !agreed(p.id) ? <span className="hint inline"> · fără acord</span> : null}
                        </>
                      }
                      detail={`${ageAt(p.dataNasterii!, `${today.slice(0, 4)}-12-31`)} ani`}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hint">Nicio aniversare.</div>
          )}
        </div>
      </div>
    </>
  );
}
