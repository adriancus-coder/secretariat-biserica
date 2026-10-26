import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, SortAwareLink } from "@/components/ui/data-table";
import { BackLink, EmptyState, PageHead } from "@/components/ui/page-head";
import { NEAM_COLUMNS, NEAM_DEFAULT_SORT, NEAM_TABLE_ID, neamRows } from "@/lib/kinship-report";
import { loadKinship } from "@/server/kinship";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Neamuri" };

/** Statistici → Neamuri: the kin groups with at least two families; each opens its tree. Every role that reads the register. */
export default async function NeamuriPage() {
  const ctx = await requireCtx();
  const kin = await loadKinship(ctx.db);
  const rows = neamRows(kin.neamuri);
  return (
    <>
      <BackLink href="/statistici">Statistici</BackLink>
      <PageHead title="Neamuri" sub="Rude din registru (părinți, copii și căsătorii) din cel puțin două familii">
        <SortAwareLink href="/pdf/neamuri" params={{}} target="_blank" rel="noopener" className="btn">
          Descarcă PDF
        </SortAwareLink>
        <SortAwareLink href="/api/statistici/neamuri" params={{}} className="btn" download>
          Exportă (Excel)
        </SortAwareLink>
      </PageHead>
      {rows.length ? (
        <section className="card">
          <DataTable
            id={NEAM_TABLE_ID}
            caption="Neamuri"
            columns={NEAM_COLUMNS}
            defaultSort={NEAM_DEFAULT_SORT}
            rows={rows.map((r) => ({
              key: r.key,
              sort: r.sort,
              cells: [
                <Link key="n" href={`/statistici/neamuri/${r.neam.id}`}>
                  {r.neam.name}
                </Link>,
                r.neam.persons,
                r.neam.membri,
                r.neam.families,
                r.neam.generations,
              ],
            }))}
          />
        </section>
      ) : (
        <EmptyState title="Niciun neam cu cel puțin două familii" />
      )}
      <p className="hint">Legăturile părinte–copil se adaugă pe fișa persoanei, la „Rude în biserică”.</p>
    </>
  );
}
