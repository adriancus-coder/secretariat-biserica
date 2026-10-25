import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, EmptyState, PageHead } from "@/components/ui/page-head";
import { dotDateTime } from "@/lib/dates";
import { dateBadge } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { documentsToSign } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Documente de semnat" };

/** The pastor's queue: documents the secretary sent for approval (Statut art. 39). */
export default async function DocumentsToSignPage() {
  const ctx = await requireCtx("pastor");
  const items = await documentsToSign(ctx);
  return (
    <>
      <BackLink href="/documente">Documente</BackLink>
      <PageHead title="De semnat" sub="Documente trimise de secretariat spre aprobare și semnare" />
      {items.length === 0 ? (
        <EmptyState title="Nu aveți documente de semnat">Când secretarul trimite un document spre semnare, apare aici.</EmptyState>
      ) : (
        <div className="list">
          {items.map((x) => {
            const d = dateBadge(x.data);
            return (
              <Link key={x.id} href={`/documente/${x.id}`} className="item">
                <div className="date">
                  <b>{d.day}</b>
                  <span>{d.mon}</span>
                </div>
                <div className="body">
                  <div className="t">{x.titlu || DOCUMENT_TYPE_LABEL[x.tip]}</div>
                  <div className="m">
                    Nr. {x.nr}/{x.anRegistru}
                    {x.persoana || x.catre ? ` · ${x.persoana || x.catre}` : ""}
                    {x.trimisLaSemnatLa ? ` · trimis la ${dotDateTime(x.trimisLaSemnatLa)}` : ""}
                  </div>
                </div>
                <span className="tag tag-gold">De semnat</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
