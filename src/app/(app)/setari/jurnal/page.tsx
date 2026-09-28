import type { Metadata } from "next";
import { AuditTrail } from "@/components/audit-trail";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { BackLink, EmptyState, PageHead } from "@/components/ui/page-head";
import { pageParam, Pager, stringParam } from "@/components/ui/pager";
import { ENTITY_LABEL } from "@/lib/audit-labels";
import type { AuditEntityKey } from "@/lib/audit-types";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Jurnal de modificări" };

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/setari/jurnal">) {
  const ctx = await requireCtx("audit");
  const sp = await searchParams;
  const entity = (Object.keys(ENTITY_LABEL) as AuditEntityKey[]).find((k) => k === stringParam(sp.tip));
  const where = entity ? { entity } : {};
  const total = await ctx.db.auditLog.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageParam(sp.pagina), pages);
  const rows = await ctx.db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Jurnal de modificări" sub="Cine, ce și când a modificat" />
      <form method="get" className="toolbar">
        <label htmlFor="tip-jurnal" className="sr-only">
          Tipul înregistrării
        </label>
        <AutoSubmitSelect id="tip-jurnal" name="tip" defaultValue={entity ?? ""} className="!w-auto !flex-none">
          <option value="">Toate înregistrările</option>
          {Object.entries(ENTITY_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </AutoSubmitSelect>
        <noscript>
          <button type="submit" className="btn btn-sm">
            Arată
          </button>
        </noscript>
      </form>
      {rows.length ? (
        <div className="card">
          <AuditTrail
            rows={rows.map((r) => ({ ...r, entityLabel: `${ENTITY_LABEL[r.entity]}: ${r.entityLabel}` }))}
            showLabel
          />
        </div>
      ) : (
        <EmptyState title="Nicio modificare înregistrată" />
      )}
      <Pager pathname="/setari/jurnal" params={{ tip: entity }} page={page} pages={pages} summary={`${total} intrări`} />
    </>
  );
}
