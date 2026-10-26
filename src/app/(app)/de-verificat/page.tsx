import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { dotDateTime } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { NameRow } from "@/components/ui/name-row";
import type { DataUpdateProposal } from "@/lib/schemas/data-update";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "De verificat" };

/** Data-update submissions waiting for the secretary (personal and general links). */
export default async function ReviewQueuePage() {
  const ctx = await requireCtx("write");
  const rows = await ctx.db.dataUpdateSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { updatedAt: "asc" },
    include: { campaign: { select: { nume: true } }, person: { select: { nume: true, prenume: true } } },
  });
  return (
    <>
      <PageHead title="De verificat" sub="Datele trimise prin campania de actualizare ajung în evidență doar după aprobare" />
      {rows.length ? (
        <ul className="list">
          {rows.map((r) => {
            const p = r.proposed as unknown as DataUpdateProposal;
            return (
              <li key={r.id}>
                <Link href={`/de-verificat/${r.id}`} className="item">
                  <span className="grow min-w-0">
                    <NameRow
                      name={<b>{r.person ? memberName(r.person) : `${p.self.prenume} ${p.self.nume}`.trim()}</b>}
                      detail={`${r.campaign.nume} · ${r.via === "PERSONAL" ? "link personal" : r.person ? "link general, potrivit" : "link general, nepotrivit"} · ${dotDateTime(r.updatedAt)}${p.children.length ? ` · ${p.children.length} ${p.children.length === 1 ? "copil" : "copii"}` : ""}`}
                    />
                  </span>
                  <span className={r.via === "GENERAL" && !r.person ? "tag tag-warn" : "tag"}>{r.via === "PERSONAL" ? "Personal" : "General"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="Nimic de verificat" />
      )}
    </>
  );
}
