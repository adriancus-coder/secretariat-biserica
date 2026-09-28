import Link from "next/link";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { PageHead } from "@/components/ui/page-head";
import { AGE_BANDS, percentOf } from "@/domain/stats";
import { ageAt, todayIso, toDbDate } from "@/lib/dates";
import { fmt, fmtShort, memberName, MONTHS_L } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { getChurch } from "@/server/queries/church";
import { loadStats } from "@/server/queries/stats";
import { requireCtx } from "@/server/session";

function Bar({ label, n, width, warn }: { label: string; n: number; width: number; warn?: boolean }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div className="track">
        <span style={{ width: `${width}%`, background: warn ? "var(--warn)" : undefined }} />
      </div>
      <em>{n}</em>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
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
  const reportHref = canWrite ? `/documente/nou?tip=raport&an=${selectedYear}` : `/pdf/dare-de-seama?an=${selectedYear}`;

  return (
    <>
      <PageHead
        title={church.nume}
        sub={year && s.endDate !== today ? `Situația la ${fmt(s.endDate)} (retroactiv)` : `Situația la ${fmt(today)}`}
      />

      <div className="stats">
        <Stat value={s.ev.length} label="persoane în evidență" />
        <Stat value={s.membri.length} label={`membri · ${percentOf(s.membri.length, s.ev.length)}%`} />
        <Stat value={s.fams} label="familii" />
      </div>
      <div className="stats">
        <Stat value={s.botezati.length} label="botezați" />
        <Stat value={s.apart.length} label="aparținători" />
        <Stat value={s.prieteni.length} label="prieteni nebotezați" />
      </div>
      <div className="stats mb-4">
        <Stat value={s.copii.length} label="copii minori" />
        <Stat value={s.copiiMembri.length} label="copii ai membrilor" />
        <Stat value={`${s.gen.M}/${s.gen.F}`} label="bărbați / femei" />
      </div>

      <div className="two">
        <div className="card">
          <h3>Anul {s.y}</h3>
          <div className="bars">
            <Bar label="Botezați" n={s.intrBotez.length} width={move(s.intrBotez.length)} />
            <Bar label="Transferați" n={s.intrTransfer.length} width={move(s.intrTransfer.length)} />
            <Bar label="Reprimiți" n={s.reprimiri.length} width={move(s.reprimiri.length)} />
            <Bar label="Binecuv." n={s.binecuv.length} width={move(s.binecuv.length)} />
            <Bar label="Ieșiri" n={s.iesiri.length} width={move(s.iesiri.length)} warn />
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
              <Bar key={label} label={AGE_BANDS[i][0]} n={n} width={(n / maxBand) * 100} />
            ))}
          </div>
          <div className="hint mt-2">{s.ev.filter((p) => !p.dataNasterii).length} persoane fără dată de naștere</div>
        </div>

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
