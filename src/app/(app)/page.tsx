import Link from "next/link";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { PageHead } from "@/components/ui/page-head";
import { ageKey } from "@/domain/categories";
import { AGE_BANDS, percentOf } from "@/domain/stats";
import { categoryHref } from "@/lib/category-params";
import { ageAt, todayIso, toDbDate } from "@/lib/dates";
import { fmt, fmtShort, memberName, MONTHS_L } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { getChurch } from "@/server/queries/church";
import { committee as loadCommittee } from "@/server/queries/roles";
import { loadStats } from "@/server/queries/stats";
import { requireCtx } from "@/server/session";
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
  const birthdays = persons
    .filter((p) => p.dataNasterii && p.dataNasterii.slice(5, 7) === month && !p.dataIesire)
    .sort((a, b) => a.dataNasterii!.slice(8).localeCompare(b.dataNasterii!.slice(8)));
  const canWrite = permissions.write(ctx.user.role);
  // Administrators are reminded of the monthly JSON export (backup policy, docs/SECURITY.md).
  const exportDays = permissions.admin(ctx.user.role) ? await daysSinceLastExport(ctx) : undefined;
  const exportDue = exportDays !== undefined && (exportDays === null || exportDays > EXPORT_REMINDER_DAYS);
  const reportHref = canWrite ? `/documente/nou?tip=raport&an=${selectedYear}` : `/pdf/dare-de-seama?an=${selectedYear}`;

  return (
    <>
      <PageHead
        title={church.nume}
        sub={year && s.endDate !== today ? `Situația la ${fmt(s.endDate)} (retroactiv)` : `Situația la ${fmt(today)}`}
      />

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
        <Stat value={s.prieteni.length} label="prieteni nebotezați" href={cat("prieteni")} />
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
            <Bar label="Reprimiți" n={s.reprimiri.length} width={move(s.reprimiri.length)} href={cat("reprimiti")} />
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
          {birthdays.length ? (
            <ul>
              {birthdays.map((p) => (
                <li key={p.id}>
                  <Link href={`/persoane/${p.id}`} className="flex gap-3 py-1.5 no-underline text-ink hover:underline">
                    <b className="w-[36px] shrink-0 font-serif">{Number(p.dataNasterii!.slice(8))}</b>
                    <span className="min-w-0 truncate">{memberName(p)}</span>
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
