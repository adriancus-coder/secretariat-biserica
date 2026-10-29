import { GeneratedActions } from "@/components/generated/generated-actions";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { DataTable } from "@/components/ui/data-table";
import { SortAwareDownload } from "@/components/ui/download";
import { MIME } from "@/lib/download";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, stringParam } from "@/components/ui/pager";
import { SearchBox } from "@/components/ui/search-box";
import {
  DIRECTION_FILTER_LABEL,
  DIRECTION_FILTERS,
  DIRECTION_LABEL,
  filterRows,
  REGISTER_COLUMNS,
  REGISTER_DEFAULT_SORT,
  REGISTER_TABLE_ID,
  sortValues,
  type DirectionFilter,
} from "@/lib/correspondence";
import { fmt } from "@/lib/format";
import { todayIso } from "@/lib/dates";
import { permissions } from "@/lib/permissions";
import { correspondenceYears, loadRegister } from "@/server/queries/correspondence";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Corespondență" };

/**
 * „Registru de intrare-ieșire” (Statut art. 43 alin. 7: the secretary „efectuează corespondența”):
 * entries and exits of a year, with the documents issued in the app as exits. Every role that reads the
 * register; write roles register and answer.
 */
export default async function CorrespondenceListPage({ searchParams }: PageProps<"/corespondenta">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const current = Number(todayIso().slice(0, 4));
  const years = await correspondenceYears(ctx, current);
  const an = years.includes(Number(sp.an)) ? Number(sp.an) : current;
  const raw = stringParam(sp.filtru);
  const filter: DirectionFilter = (DIRECTION_FILTERS as readonly string[]).includes(raw) ? (raw as DirectionFilter) : "toate";
  const q = stringParam(sp.q).slice(0, 100);
  const rows = filterRows(await loadRegister(ctx, an), filter, q);
  const canWrite = permissions.write(ctx.user.role);
  const params = { an: String(an), filtru: filter === "toate" ? undefined : filter, q: q || undefined };
  return (
    <>
      <PageHead title="Corespondență" sub={`Registru de intrare-ieșire ${an} · ${rows.length} înregistrări`}>
        {canWrite ? (
          <Link href="/corespondenta/nou?directie=INTRARE" className="btn btn-primary">
            + Înregistrează intrare
          </Link>
        ) : null}
        {canWrite ? (
          <Link href="/corespondenta/nou?directie=IESIRE" className="btn">
            + Înregistrează ieșire
          </Link>
        ) : null}
      </PageHead>
      <p className="hint mb-3">
        Un singur șir de numere pe an pentru intrări și ieșiri. Documentele emise din aplicație apar ca ieșiri, cu numărul lor în coloana „Nr. document”. Se înregistrează
        doar datele scrisorilor, nu și conținutul lor.
      </p>
      <nav className="segs" aria-label="Intrări sau ieșiri">
        {DIRECTION_FILTERS.map((f) => (
          <Link key={f} href={hrefWith("/corespondenta", params, { filtru: f === "toate" ? null : f })} aria-current={filter === f ? "true" : undefined}>
            {DIRECTION_FILTER_LABEL[f]}
          </Link>
        ))}
      </nav>
      <div className="toolbar">
        <form method="get" className="flex gap-2 items-center flex-wrap">
          <label htmlFor="an" className="sr-only">
            Anul
          </label>
          <AutoSubmitSelect id="an" name="an" defaultValue={String(an)} className="!w-auto">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
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
          <SearchBox placeholder="Caută număr, expeditor, destinatar, subiect" />
        </Suspense>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <GeneratedActions ctx={ctx} kind="corespondenta" params={params} fileName={`registru-intrare-iesire-${an}`} />
        <SortAwareDownload file="/api/corespondenta" params={params} filename="registru-corespondenta.xlsx" mime={MIME.xlsx}>
          Exportă (Excel)
        </SortAwareDownload>
      </div>
      {rows.length ? (
        <section className="card">
          <DataTable
            id={REGISTER_TABLE_ID}
            caption={`Registru de intrare-ieșire ${an}`}
            columns={REGISTER_COLUMNS}
            defaultSort={REGISTER_DEFAULT_SORT}
            rows={rows.map((r) => ({
              key: r.key,
              sort: sortValues(r),
              cells: [
                r.nr ?? "—",
                fmt(r.data),
                DIRECTION_LABEL[r.directie],
                r.party,
                r.id ? (
                  <Link key="s" href={`/corespondenta/${r.id}`}>
                    {r.subiect}
                  </Link>
                ) : (
                  <Link key="s" href={`/documente/${r.documentId}`}>
                    {r.subiect}
                  </Link>
                ),
                r.rezolvare || (r.raspunsLa ? `Răspuns la ${r.raspunsLa}` : ""),
                r.docNr ?? "",
              ],
            }))}
          />
        </section>
      ) : (
        <EmptyState title={q ? "Niciun rezultat" : "Nicio înregistrare în acest an"}>{q ? "Schimbați căutarea." : "Înregistrați o intrare sau o ieșire."}</EmptyState>
      )}
    </>
  );
}
