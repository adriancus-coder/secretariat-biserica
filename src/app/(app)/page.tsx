import Link from "next/link";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { PageHead } from "@/components/ui/page-head";
import { ageKey } from "@/domain/categories";
import { AGE_BANDS, percentOf } from "@/domain/stats";
import { categoryHref } from "@/lib/category-params";
import { ageAt, monthsBefore, todayIso, toDbDate } from "@/lib/dates";
import { fmt, fmtShort, memberName, MONTHS_L } from "@/lib/format";
import { isGeneralAssembly, ordinaryAssemblyMissing } from "@/lib/general-assembly";
import { permissions } from "@/lib/permissions";
import { mandateNotice } from "@/lib/committee";
import { committeeAbsences } from "@/server/queries/committee";
import { getChurch } from "@/server/queries/church";
import { committee as loadCommittee } from "@/server/queries/roles";
import { loadStats } from "@/server/queries/stats";
import { requireCtx } from "@/server/session";
import { deleteExpiredContactsAction } from "@/server/actions/statute";
import { expiredContactWhere } from "@/server/retention";
import { loadConsentStates } from "@/server/consents";
import { daysSinceLastExport, EXPORT_REMINDER_DAYS, exportAgeText } from "@/server/queries/export-reminder";

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
function Stat({ value, label, href }: { value: React.ReactNode; label: React.ReactNode; href?: string }) {
  return href ? (
    <Link href={href} className="stat stat-link">
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
  const absences = permissions.admin(ctx.user.role) ? await committeeAbsences(ctx, church) : [];
  const reportHref = canWrite ? `/documente/nou?tip=raport&an=${selectedYear}` : `/pdf/dare-de-seama?an=${selectedYear}`;

  return (
    <>
      <PageHead
        title={church.nume}
        sub={year && s.endDate !== today ? `Situația la ${fmt(s.endDate)} (retroactiv)` : `Situația la ${fmt(today)}`}
      />

      {mandate ? (
        <div className="alert mb-4" role="status">
          {mandate} <Link href="/setari">Setări</Link>
        </div>
      ) : null}
      {absences.length ? (
        <div className="alert mb-4" role="status">
          Absențe nemotivate la rând la ședințele comitetului (Statut art. 45):{" "}
          {absences.map((a, i) => (
            <span key={a.id}>
              {i ? ", " : ""}
              <Link href={`/persoane/${a.id}`}>{a.name}</Link> ({a.count})
            </span>
          ))}
          .
        </div>
      ) : null}
      {agMissing ? (
        <div className="alert mb-4" role="status">
          Adunarea Generală ordinară nu a avut loc în {today.slice(0, 4)} (Statut art. 46 alin. 3).{" "}
          <Link href="/procese-verbale/nou">Ședință nouă</Link>
        </div>
      ) : null}
      {away3 ? (
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
        <Stat value={s.ev.length} label="persoane în evidență" href={cat("toti")} />
        <Stat value={s.membri.length} label={`membri · ${percentOf(s.membri.length, s.ev.length)}%`} href={cat("membri")} />
        <Stat value={s.fams} label="familii" href="/familii" />
      </div>
      <div className="stats">
        <Stat value={s.botezati.length} label="botezați" href={cat("botezati")} />
        <Stat value={s.apart.length} label="aparținători" href={cat("apartinatori")} />
        <Stat value={s.prieteni.length} label="prieteni ai casei Domnului" href={cat("prieteni")} />
      </div>
      <div className="stats">
        <Stat value={s.apartA.length} label="aparținători a) minori din familii de credincioși" href={cat("apartinatori-a")} />
        <Stat value={s.apartB.length} label="aparținători b) nebotezați hotărâți" href={cat("apartinatori-b")} />
        <Stat value={s.botezatiFara.length} label="botezați fără calitate de membru" href={cat("botezati-fara-calitate")} />
      </div>
      <div className="stats mb-4">
        <Stat value={s.copii.length} label="copii minori" href={cat("copii-minori")} />
        <Stat value={s.copiiMembri.length} label="copii ai membrilor" href={cat("copii-membri")} />
        <div className="stat">
          <b>
            <Link href={cat("barbati")} className="stat-link" aria-label={`${s.gen.M} bărbați — vezi lista`}>
              {s.gen.M}
            </Link>
            /
            <Link href={cat("femei")} className="stat-link" aria-label={`${s.gen.F} femei — vezi lista`}>
              {s.gen.F}
            </Link>
          </b>
          <span>bărbați / femei</span>
        </div>
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
            <Link href={reportHref} className="btn btn-primary btn-sm" prefetch={false}>
              Dare de seamă {selectedYear}
            </Link>
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
                  <Link href={`/persoane/${m.id}`} className="flex gap-3 py-1.5 no-underline text-ink hover:underline">
                    <span className="min-w-0 truncate">{m.name}</span>
                    <span className="hint !mt-0 ml-auto shrink-0 text-right">{m.roles.join(", ")}</span>
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
                  <Link href={`/calendar/${e.id}`} className="flex gap-3 py-1.5 no-underline text-ink hover:underline">
                    <b className="w-[60px] shrink-0 font-serif">{fmtShort(e.data.toISOString().slice(0, 10))}</b>
                    <span className="min-w-0 truncate">{e.titlu}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hint">Nimic programat.</div>
          )}
        </div>

        <div className="card">
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
                  <Link href={`/persoane/${p.id}`} className="flex gap-3 py-1.5 no-underline text-ink hover:underline">
                    <b className="w-[36px] shrink-0 font-serif">{Number(p.dataNasterii!.slice(8))}</b>
                    <span className="min-w-0 truncate">
                      {memberName(p)}
                      {showAllBirthdays && !agreed(p.id) ? <span className="hint inline"> · fără acord</span> : null}
                    </span>
                    <span className="hint !mt-0 ml-auto shrink-0">
                      {ageAt(p.dataNasterii!, `${today.slice(0, 4)}-12-31`)} ani
                    </span>
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
