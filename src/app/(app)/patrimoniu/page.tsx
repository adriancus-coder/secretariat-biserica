import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { DataTable, SortAwareLink } from "@/components/ui/data-table";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, stringParam } from "@/components/ui/pager";
import { SearchBox } from "@/components/ui/search-box";
import { fmt } from "@/lib/format";
import {
  ASSET_COLUMNS,
  ASSET_DEFAULT_SORT,
  ASSET_FILTER_LABEL,
  ASSET_FILTERS,
  ASSET_STATE_LABEL,
  ASSET_TABLE_ID,
  assetSort,
  categoryTotals,
  filterAssets,
  nok,
  type AssetFilter,
} from "@/lib/patrimony";
import { permissions } from "@/lib/permissions";
import { loadAssets } from "@/server/queries/assets";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Patrimoniu" };

/**
 * The inventory of the church's goods (Statut art. 43 alin. 7: the secretary „ține la zi evidența
 * patrimoniului”; art. 54 alin. 2). Every role that reads the register; write roles add, edit and retire.
 */
export default async function PatrimonyPage({ searchParams }: PageProps<"/patrimoniu">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const raw = stringParam(sp.filtru);
  const filter: AssetFilter = (ASSET_FILTERS as readonly string[]).includes(raw) ? (raw as AssetFilter) : "in-uz";
  const categorie = stringParam(sp.categorie).slice(0, 80);
  const q = stringParam(sp.q).slice(0, 100);
  const [all, church] = await Promise.all([loadAssets(ctx), getChurch(ctx)]);
  const rows = filterAssets(all, filter, categorie, q);
  const totals = categoryTotals(rows);
  const canWrite = permissions.write(ctx.user.role);
  const params = { filtru: filter === "in-uz" ? undefined : filter, categorie: categorie || undefined, q: q || undefined };
  const categories = [...new Set([...church.nomen.categoriiPatrimoniu, ...all.map((a) => a.categorie)])];
  return (
    <>
      <PageHead title="Patrimoniu" sub={`Inventarul bunurilor · ${rows.length} ${rows.length === 1 ? "poziție" : "poziții"}`}>
        {canWrite ? (
          <Link href="/patrimoniu/nou" className="btn btn-primary">
            + Bun nou
          </Link>
        ) : null}
      </PageHead>
      <p className="hint mb-3">Secretarul ține la zi evidența patrimoniului (Statut art. 43 alin. 7); un bun nu se șterge, ci se scoate din uz, cu data și motivul.</p>
      <nav className="segs" aria-label="Starea bunurilor">
        {ASSET_FILTERS.map((f) => (
          <Link key={f} href={hrefWith("/patrimoniu", params, { filtru: f === "in-uz" ? null : f })} aria-current={filter === f ? "true" : undefined}>
            {ASSET_FILTER_LABEL[f]}
          </Link>
        ))}
      </nav>
      <div className="toolbar">
        <form method="get" className="flex gap-2 items-center flex-wrap">
          <label htmlFor="categorie" className="sr-only">
            Categoria
          </label>
          <AutoSubmitSelect id="categorie" name="categorie" defaultValue={categorie} className="!w-auto">
            <option value="">Toate categoriile</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </AutoSubmitSelect>
          {params.filtru ? <input type="hidden" name="filtru" value={params.filtru} /> : null}
          <noscript>
            <button type="submit" className="btn btn-sm">
              Arată
            </button>
          </noscript>
        </form>
        <Suspense>
          <SearchBox placeholder="Caută denumire, loc, responsabil" />
        </Suspense>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <SortAwareLink href="/pdf/patrimoniu" params={params} target="_blank" rel="noopener" className="btn">
          Descarcă PDF (cu semnături)
        </SortAwareLink>
        <SortAwareLink href="/api/patrimoniu" params={params} className="btn" download>
          Exportă (Excel)
        </SortAwareLink>
      </div>
      {rows.length ? (
        <>
          <section className="card">
            <DataTable
              id={ASSET_TABLE_ID}
              caption="Inventarul bunurilor"
              columns={ASSET_COLUMNS}
              defaultSort={ASSET_DEFAULT_SORT}
              rows={rows.map((a) => ({
                key: a.id,
                sort: assetSort(a),
                cells: [
                  a.nrInventar,
                  <Link key="d" href={`/patrimoniu/${a.id}`}>
                    {a.denumire}
                  </Link>,
                  a.categorie,
                  a.cantitate,
                  nok(a.valoare),
                  a.loc,
                  ASSET_STATE_LABEL[a.stare],
                  a.dataIntrarii ? fmt(a.dataIntrarii) : "",
                ],
              }))}
            />
          </section>
          <section className="card">
            <h3>Totaluri pe categorii</h3>
            <DataTable
              id="patrimoniu-totaluri"
              caption="Totaluri pe categorii"
              columns={[
                { key: "categorie", label: "Categorie", type: "text" },
                { key: "pozitii", label: "Poziții", type: "number" },
                { key: "bucati", label: "Bucăți", type: "number" },
                { key: "valoare", label: "Valoare", type: "number" },
              ]}
              rows={totals.map((t) => ({ key: t.categorie, sort: [t.categorie, t.pozitii, t.bucati, t.valoare], cells: [t.categorie, t.pozitii, t.bucati, `${nok(t.valoare)}${t.faraValoare ? ` (${t.faraValoare} fără valoare)` : ""}`] }))}
              footer={[
                {
                  key: "total",
                  sort: ["Total", rows.length, 0, 0],
                  cells: [<b key="t">Total</b>, rows.length, rows.reduce((s, a) => s + a.cantitate, 0), nok(rows.reduce((s, a) => s + (a.valoare ?? 0), 0))],
                },
              ]}
            />
          </section>
        </>
      ) : (
        <EmptyState title={q || categorie ? "Niciun rezultat" : "Niciun bun în această listă"}>{canWrite ? "Adăugați bunurile bisericii cu „+ Bun nou”." : ""}</EmptyState>
      )}
    </>
  );
}
