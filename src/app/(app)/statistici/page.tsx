import { GeneratedActions } from "@/components/generated/generated-actions";
import type { Metadata } from "next";
import Link from "next/link";
import { ChurchFamiliesStat } from "@/components/church-families-stat";
import { OTHER_CHILDREN_HINT, OTHER_CHILDREN_LABEL } from "@/lib/labels";
import { LineChart, Pyramid, StackedBars } from "@/components/charts";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { PageHead } from "@/components/ui/page-head";
import { ageKey } from "@/domain/categories";
import { EVOLUTION_KEYS } from "@/domain/evolution";
import { categoryHref } from "@/lib/category-params";
import { MONTHS_L } from "@/lib/format";
import { requestedYear } from "@/lib/statistics-params";
import { bandLabel, GENDER_ROW_LABEL, statisticsTableDefs, statisticsWhen } from "@/lib/statistics-report";
import { DataTable } from "@/components/ui/data-table";
import { SortAwareDownload } from "@/components/ui/download";
import { MIME } from "@/lib/download";
import { loadStatistics } from "@/server/queries/statistics";
import { requireCtx } from "@/server/session";
import { loadKinship } from "@/server/kinship";
import { listedNeamuri } from "@/lib/kinship-report";

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
  const neamCount = listedNeamuri((await loadKinship(ctx.db)).neamuri).length;
  const st = d.structure;
  const cat = (key: string, an: number | undefined, extra?: Record<string, string>) => categoryHref(key, an, extra);
  const both = (a: string, b: string, an: number | undefined) => categoryHref([a, b], an, { mod: "toate" });
  // Charts stay chronological (left = oldest) whatever the tables' sort.
  const labels = d.rows.map((r) => String(r.year));
  const [evo, , ages, status, genderAge] = statisticsTableDefs(d);
  const missing = (
    <p className="hint">
      <Link href={cat("fara-data-nasterii", d.an)}>{st.withoutBirthDate} persoane fără dată de naștere</Link> nu sunt incluse
      {st.withoutGender ? ` · ${st.withoutGender} fără gen nu apar în piramidă` : ""}.
    </p>
  );

  return (
    <>
      <PageHead title="Statistici" sub={statisticsWhen(d)}>
        {/* The exports follow the table sort chosen on the page. */}
        <GeneratedActions ctx={ctx} kind="statistici" params={{ an: String(d.year) }} fileName={`statistici-${d.year}`} />
        <SortAwareDownload file="/api/statistici/excel" params={{ an: d.an ? String(d.an) : undefined }} filename="statistici.xlsx" mime={MIME.xlsx}>
          Exportă tabelele (Excel)
        </SortAwareDownload>
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
          desc={d.rows.map((r) => `${r.year}: botez ${r.intrari.botez}, transfer ${r.intrari.transfer}, cerere ${r.intrari.cerere}, reabilitare ${r.intrari.reprimire}`).join("; ")}
          labels={labels}
          series={[
            { name: "Botez", values: d.rows.map((r) => r.intrari.botez), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.botez, r.an)) },
            { name: "Transfer", values: d.rows.map((r) => r.intrari.transfer), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.transfer, r.an)) },
            { name: "Cerere", values: d.rows.map((r) => r.intrari.cerere), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.cerere, r.an)) },
            { name: "Reabilitare", values: d.rows.map((r) => r.intrari.reprimire), hrefs: d.rows.map((r) => cat(EVOLUTION_KEYS.reprimire, r.an)) },
          ]}
        />
        </div>
        <DataTable
          id={evo.id}
          caption="Evoluția pe ani: membri, intrări, ieșiri, binecuvântări, creștere netă"
          columns={evo.columns}
          defaultSort={evo.defaultSort}
          rows={d.rows.map((r, i) => ({
            key: String(r.year),
            sort: evo.rows[i].sort,
            classes: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, r.crestere < 0 ? "neg" : undefined],
            cells: [
              r.year,
              <N key="m" n={r.membri} href={cat("membri", r.an)} />,
              <N key="b" n={r.intrari.botez} href={cat(EVOLUTION_KEYS.botez, r.an)} />,
              <N key="t" n={r.intrari.transfer} href={cat(EVOLUTION_KEYS.transfer, r.an)} />,
              <N key="c" n={r.intrari.cerere} href={cat(EVOLUTION_KEYS.cerere, r.an)} />,
              <N key="r" n={r.intrari.reprimire} href={cat(EVOLUTION_KEYS.reprimire, r.an)} />,
              <N key="i" n={r.iesiri.total} href={cat(EVOLUTION_KEYS.iesiri, r.an)} />,
              <N key="it" n={r.iesiri.transfer} href={cat(EVOLUTION_KEYS.iesiriTransfer, r.an)} />,
              <N key="re" n={r.iesiri.retragere} href={cat(EVOLUTION_KEYS.retragere, r.an)} />,
              <N key="d" n={r.iesiri.deces} href={cat(EVOLUTION_KEYS.deces, r.an)} />,
              <N key="e" n={r.iesiri.excludere} href={cat(EVOLUTION_KEYS.excludere, r.an)} />,
              <N key="bc" n={r.binecuvantari} href={cat(EVOLUTION_KEYS.binecuvantari, r.an)} />,
              r.crestere > 0 ? `+${r.crestere}` : r.crestere,
            ],
          }))}
        />
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
          <Link href={cat(EVOLUTION_KEYS.reprimire, d.an)}>reabilitați</Link> · <Link href={cat(EVOLUTION_KEYS.iesiri, d.an)}>ieșiri</Link>
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
        <DataTable
          id={ages.id}
          caption="Persoane pe grupe de vârstă și gen"
          columns={ages.columns}
          rows={st.pyramid.map((r, i) => ({
            key: String(r.min),
            sort: ages.rows[i].sort,
            cells: [
              bandLabel(r.min, r.max),
              <N key="m" n={r.M} href={both("barbati", ageKey(r.min, r.max), d.an)} />,
              <N key="f" n={r.F} href={both("femei", ageKey(r.min, r.max), d.an)} />,
              <N key="t" n={st.bands[i].n} href={cat(ageKey(st.bands[i].min, st.bands[i].max), d.an)} />,
            ],
          }))}
        />
        <DataTable
          id={status.id}
          caption="Statut și gen"
          columns={status.columns}
          rows={st.byStatus.map((r, i) => ({
            key: r.key,
            sort: status.rows[i].sort,
            cells: [
              r.label,
              <N key="m" n={r.M} href={both(r.key, "barbati", d.an)} />,
              <N key="f" n={r.F} href={both(r.key, "femei", d.an)} />,
              <N key="t" n={r.total} href={cat(r.key, d.an)} />,
              // Minors are never in a marital status category: their row shows "—".
              r.key === "copii-minori" ? "—" : <N key="c" n={r.casatoriti} href={both(r.key, "casatoriti", d.an)} />,
              r.key === "copii-minori" ? "—" : <N key="n" n={r.necasatoriti} href={both(r.key, "necasatoriti", d.an)} />,
            ],
          }))}
        />
        {/* GENDER-AGE-FILTERS: every number opens the persons in the record with that gender and age. */}
        <DataTable
          id={genderAge.id}
          caption="Gen și vârstă"
          columns={genderAge.columns}
          rows={st.genderAge.rows.map((r, i) => ({
            key: r.gen,
            sort: genderAge.rows[i].sort,
            cells: [
              GENDER_ROW_LABEL[r.gen],
              <N key="a" n={r.adulti} href={cat("toti", d.an, { gen: r.gen, varsta: "adulti" })} />,
              <N key="m" n={r.minori} href={cat("toti", d.an, { gen: r.gen, varsta: "minori" })} />,
              <N key="t" n={r.total} href={cat("toti", d.an, { gen: r.gen })} />,
            ],
          }))}
          footer={[
            {
              key: "total",
              sort: [],
              cells: [
                "Total",
                <N key="a" n={st.genderAge.total.adulti} href={cat("toti", d.an, { varsta: "adulti" })} />,
                <N key="m" n={st.genderAge.total.minori} href={cat("toti", d.an, { varsta: "minori" })} />,
                <N key="t" n={st.genderAge.total.total} href={cat("toti", d.an)} />,
              ],
            },
          ]}
        />
      </section>

      <section className="card">
        <h3>Starea civilă a adulților</h3>
        <div className="stats">
          <Link href={cat("casatoriti", d.an)} className="stat stat-link">
            <b>{st.marital.casatoriti}</b>
            <span>căsătoriți</span>
          </Link>
          <Link href={cat("necasatoriti", d.an)} className="stat stat-link">
            <b>{st.marital.necasatoriti}</b>
            <span>necăsătoriți</span>
          </Link>
          <Link href={cat("stare-civila-necompletata", d.an)} className={`stat stat-link${st.marital.necompletat > 0 ? " stat-warn" : ""}`}>
            <b>{st.marital.necompletat}</b>
            <span>stare civilă necompletată</span>
          </Link>
        </div>
        <p className="hint">
          Din cei <Link href={cat("adulti", d.an)}>{st.marital.adulti} adulți în evidență</Link> (18 ani împliniți; fără dată de naștere, persoana este
          numărată ca adult). Necompletată: nici data căsătoriei, nici „Necăsătorit(ă)” pe fișa persoanei.
        </p>
      </section>

      <section className="card">
        <h3>Familii</h3>
        <div className="stats">
          <ChurchFamiliesStat count={st.families.count} others={st.families.withoutMembers} />
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
          <Link href={cat("copii-minori", d.an)} className="stat stat-link">
            <b>{st.children.total}</b>
            <span>copii minori</span>
          </Link>
          <Link href={cat("copii-membri", d.an)} className="stat stat-link">
            <b>{st.children.members}</b>
            <span>copii ai membrilor</span>
          </Link>
          <Link href={cat("copii-alte", d.an)} className="stat stat-link" title={OTHER_CHILDREN_HINT}>
            <b>{st.children.others}</b>
            <span>{OTHER_CHILDREN_LABEL}</span>
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
          <Link href="/statistici/neamuri" className="stat stat-link">
            <b>{neamCount}</b>
            <span>neamuri (cel puțin două familii)</span>
          </Link>
        </div>
      </section>
    </>
  );
}
