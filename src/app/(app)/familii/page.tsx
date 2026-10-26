import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, pageParam, Pager, stringParam } from "@/components/ui/pager";
import { SearchBox } from "@/components/ui/search-box";
import { initial } from "@/lib/format";
import { FAMILY_FILTER_LABEL, FAMILY_FILTERS, listFamilyRecords, type FamilyFilter } from "@/server/queries/families";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Familii" };

export default async function FamiliesPage({ searchParams }: PageProps<"/familii">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const q = stringParam(sp.q).slice(0, 100);
  const raw = stringParam(sp.filtru);
  const filter: FamilyFilter = (FAMILY_FILTERS as readonly string[]).includes(raw) ? (raw as FamilyFilter) : "biserica";
  const data = await listFamilyRecords(ctx, { q, page: pageParam(sp.pagina), filter });
  const params = { q: q || undefined, filtru: filter === "biserica" ? undefined : filter };
  return (
    <>
      <PageHead title="Familii" sub={`${data.total} familii`} />
      <p className="hint mb-3">
        O familie se creează din fișa persoanei („Familie nouă”), iar persoana devine capul familiei. Familiile bisericii au cel puțin un membru; celelalte rămân
        în registru, dar nu se numără și nu intră la rugăciunea săptămânală.
      </p>
      <nav className="segs" aria-label="Filtru">
        {FAMILY_FILTERS.map((f) => (
          <Link key={f} href={hrefWith("/familii", params, { filtru: f === "biserica" ? null : f, pagina: null })} aria-current={filter === f ? "true" : undefined}>
            {FAMILY_FILTER_LABEL[f]} ({data.counts[f]})
          </Link>
        ))}
      </nav>
      <div className="toolbar">
        <Suspense>
          <SearchBox placeholder="Caută familia sau un membru" />
        </Suspense>
      </div>
      {data.items.length === 0 ? (
        <EmptyState title={q ? "Niciun rezultat" : "Nicio familie"}>{q ? "Schimbați căutarea." : "Familiile apar când persoanele sunt grupate pe familii."}</EmptyState>
      ) : (
        <div className="list">
          {data.items.map((f) => (
            <Link key={f.id} href={`/familii/${f.id}`} className="item">
              <div className="av" aria-hidden="true">
                {initial(f.head || f.nume.replace(/^Fam\.\s*/, ""))}
              </div>
              <div className="body">
                <div className="t">
                  {f.nume}
                  {f.church ? null : <span className="tag ml-2">fără membri</span>}
                </div>
                <div className="m">
                  {f.count === 1 ? "1 persoană" : `${f.count} persoane`}
                  {f.adresa ? ` · ${f.adresa}` : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pager pathname="/familii" params={params} page={data.page} pages={data.pages} summary={`${data.total} familii`} />
    </>
  );
}
