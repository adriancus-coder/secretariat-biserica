import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, Pyramid, StackedBars } from "@/components/charts";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { PageHead } from "@/components/ui/page-head";
import { ageKey } from "@/domain/categories";
import { EVOLUTION_KEYS } from "@/domain/evolution";
import { categoryHref } from "@/lib/category-params";
import { MONTHS_L } from "@/lib/format";
import { requestedYear } from "@/lib/statistics-params";
import { bandLabel, statisticsWhen } from "@/lib/statistics-report";
import { loadStatistics } from "@/server/queries/statistics";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Statistici" };

const num = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));

/** A number that opens its list of persons. */
function N({ n, href }: { n: number; href: string }) {
  return (
    <Link href={href} className="num-link">
      {n}
    </Link>
  );
}

/** Evolution over ten years and the structure of the church; every figure opens its list. All roles. */
export default async function StatisticsPage({ searchParams }: PageProps<"/statistici">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const d = await loadStatistics(ctx, requestedYear(sp.an));
  const st = d.structure;
  const cat = (key: string, an: number | undefined, extra?: Record<string, string>) => categoryHref(key, an, extra);
  const both = (a: string, b: string, an: number | undefined) => categoryHref([a, b], an, { mod: "toate" });
  const labels = d.rows.map((r) => String(r.year));
  const missing = (
    <p className="hint">
      <Link href={cat("fara-data-nasterii", d.an)}>{st.withoutBirthDate} persoane fără dată de naștere</Link> nu sunt incluse
      {st.withoutGender ? ` · ${st.withoutGender} fără gen nu apar în piramidă` : ""}.
    </p>
  );

  return (
    <>
      <PageHead title="Statistici" sub={statisticsWhen(d)}>
        <a href={`/pdf/statistici${d.an ? `?an=${d.an}` : ""}`} target="_blank" rel="noopener" className="btn">
          Descarcă PDF
        </a>
        <a href={`/api/statistici/excel${d.an ? `?an=${d.an}` : ""}`} className="btn" download>
          Exportă tabelele (Excel)
        </a>
      </PageHead>
      <form method="get" className="toolbar items-center">
        <label htmlFor="an" className="sr-only">
          Anul
        </label>
        <AutoSubmitSelect id="an" name="an" defaultValue={String(d.year)}>
          {d.years.map((y) => (
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
      </form>

      <section className="card">
        <h3>Evoluție ({d.rows[0].year}–{d.year})</h3>
        <div className="chart-pair">
        <LineChart
          title="Membri la sfârșitul fiecărui an"
          desc={d.rows.map((r) => `${r.year}: ${r.membri}`).join(", ")}
          labels={labels}
          series={[{ name: "Membri", values: d.rows.map((r) => r.membri), hrefs: d.rows.map((r) => cat("membri", r.an)) }]}
        />
        <StackedBars
          title="Intrări pe an, după mod"
          desc={d.rows.map((r) => `${r.year}: botez ${r.intrari.botez}, transfer ${r.intrari.transfer}, cerere ${r.intrari.cerere}, reprimire ${r.intrari.reprimire}`).join("; ")}
          labels={labels}
          series={[
            { name: "Botez", values: d.rows.map((r) => r.intrari.botez), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.botez, r.an)) },
            { name: "Transfer", values: d.rows.map((r) => r.intrari.transfer), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.transfer, r.an)) },
            { name: "Cerere", values: d.rows.map((r) => r.intrari.cerere), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.cerere, r.an)) },
            { name: "Reprimire", values: d.rows.map((r) => r.intrari.reprimire), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.reprimire, r.an)) },
          ]}
        />
        </div>
        <div className="table-scroll" data-scroll>
          <table className="stats-table">
            <caption className="sr-only">Evoluția pe ani: membri, intrări, ieșiri, binecuvântări, creștere netă</caption>
            <thead>
              <tr>
                <th>An</th>
                <th>Membri</th>
                <th>Botez</th>
                <th>Transfer</th>
                <th>Cerere</th>
                <th>Reprimire</th>
                <th>Ieșiri</th>
                <th>Transfer</th>
                <th>Retragere</th>
                <th>Deces</th>
                <th>Excludere</th>
                <th>Binecuv.</th>
                <th>Creștere</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.year}>
                  <th scope="row">{r.year}</th>
                  <td><N n={r.membri} href={cat("membri", r.an)} /></td>
                  <td><N n={r.intrari.botez} href={cat(EVOLUTION_KEYS.botez, r.an)} /></td>
                  <td><N n={r.intrari.transfer} href={cat(EVOLUTION_KEYS.transfer, r.an)} /></td>
                  <td><N n={r.intrari.cerere} href={cat(EVOLUTION_KEYS.cerere, r.an)} /></td>
                  <td><N n={r.intrari.reprimire} href={cat(EVOLUTION_KEYS.reprimire, r.an)} /></td>
                  <td><N n={r.iesiri.total} href={cat(EVOLUTION_KEYS.iesiri, r.an)} /></td>
                  <td><N n={r.iesiri.transfer} href={cat(EVOLUTION_KEYS.iesiriTransfer, r.an)} /></td>
                  <td><N n={r.iesiri.retragere} href={cat(EVOLUTION_KEYS.retragere, r.an)} /></td>
                  <td><N n={r.iesiri.deces} href={cat(EVOLUTION_KEYS.deces, r.an)} /></td>
                  <td><N n={r.iesiri.excludere} href={cat(EVOLUTION_KEYS.excludere, r.an)} /></td>
                  <td><N n={r.binecuvantari} href={cat(EVOLUTION_KEYS.binecuvantari, r.an)} /></td>
                  <td className={r.crestere < 0 ? "neg" : undefined}>{r.crestere > 0 ? `+${r.crestere}` : r.crestere}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Membri la 31 decembrie (anul curent: la zi). Intrările prin botez numără botezurile anului, ca în darea de seamă.</p>
      </section>

      <section className="card">
        <h3>Anul {d.year}, pe luni</h3>
        <StackedBars
          title={`Intrări și ieșiri în ${d.year}, pe luni`}
          desc={d.months.map((m) => `${MONTHS_L[m.month - 1]}: ${m.intrari} intrări, ${m.iesiri} ieșiri`).join("; ")}
          labels={d.months.map((m) => MONTHS_L[m.month - 1].slice(0, 3))}
          series={[
            { name: "Intrări", values: d.months.map((m) => m.intrari) },
            { name: "Ieșiri", values: d.months.map((m) => m.iesiri) },
          ]}
        />
        <p className="hint">
          Listele anului: <Link href={cat(EVOLUTION_KEYS.botez, d.an)}>botezați</Link> ·{" "}
          <Link href={cat(EVOLUTION_KEYS.transfer, d.an)}>transferați</Link> · <Link href={cat(EVOLUTION_KEYS.cerere, d.an)}>cereri</Link> ·{" "}
          <Link href={cat(EVOLUTION_KEYS.reprimire, d.an)}>reprimiți</Link> · <Link href={cat(EVOLUTION_KEYS.iesiri, d.an)}>ieșiri</Link>
        </p>
      </section>

      <section className="card">
        <h3>Structura pe vârste și gen</h3>
        <Pyramid
          title="Piramida vârstelor"
          desc={st.pyramid.map((r) => `${bandLabel(r.min, r.max)} ani: ${r.M} bărbați, ${r.F} femei`).join("; ")}
          rows={st.pyramid.map((r) => ({
            label: bandLabel(r.min, r.max),
            M: r.M,
            F: r.F,
            hrefM: both("barbati", ageKey(r.min, r.max), d.an),
            hrefF: both("femei", ageKey(r.min, r.max), d.an),
          }))}
        />
        {missing}
        <div className="stats">
          <div className="stat">
            <b>{num(st.ageAvg)}</b>
            <span>vârsta medie a membrilor</span>
          </div>
          <div className="stat">
            <b>{num(st.ageMedian)}</b>
            <span>vârsta mediană a membrilor</span>
          </div>
        </div>
        <div className="table-scroll" data-scroll>
          <table className="stats-table">
            <caption className="sr-only">Persoane pe grupe de vârstă</caption>
            <thead>
              <tr>
                {st.bands.map((b) => (
                  <th key={b.min}>{bandLabel(b.min, b.max)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {st.bands.map((b) => (
                  <td key={b.min}>
                    <N n={b.n} href={cat(ageKey(b.min, b.max), d.an)} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="table-scroll" data-scroll>
          <table className="stats-table">
            <caption className="sr-only">Statut și gen</caption>
            <thead>
              <tr>
                <th></th>
                <th>Bărbați</th>
                <th>Femei</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {st.byStatus.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td><N n={r.M} href={both(r.key, "barbati", d.an)} /></td>
                  <td><N n={r.F} href={both(r.key, "femei", d.an)} /></td>
                  <td><N n={r.total} href={cat(r.key, d.an)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Familii</h3>
        <div className="stats">
          <Link href="/familii" className="stat stat-link">
            <b>{st.families.count}</b>
            <span>familii</span>
          </Link>
          <div className="stat">
            <b>{num(st.families.avgSize)}</b>
            <span>persoane pe familie, în medie</span>
          </div>
          <Link href={cat("copii-minori", d.an)} className="stat stat-link">
            <b>{st.families.withMinors}</b>
            <span>familii cu copii minori</span>
          </Link>
        </div>
        <div className="stats">
          <Link href={cat("singuri-in-familie", d.an)} className="stat stat-link">
            <b>{st.families.alone}</b>
            <span>persoane singure în familie</span>
          </Link>
          <Link href={cat("fara-familie", d.an)} className="stat stat-link">
            <b>{st.families.withoutFamily}</b>
            <span>persoane fără familie</span>
          </Link>
        </div>
      </section>
    </>
  );
}
