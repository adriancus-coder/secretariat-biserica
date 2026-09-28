import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { pageParam, Pager, stringParam } from "@/components/ui/pager";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { dateBadge } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { listDocuments } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Documente" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documente">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const an = Number(stringParam(sp.an));
  const year = Number.isInteger(an) && an > 1800 ? an : null;
  const data = await listDocuments(ctx, { page: pageParam(sp.pagina), year });
  const canWrite = permissions.write(ctx.user.role);

  return (
    <>
      <PageHead title="Documente" sub="Adeverințe, certificate, scrisori, dări de seamă — registru de ieșire">
        {canWrite ? (
          <Link href="/documente/nou" className="btn btn-primary">
            + Document
          </Link>
        ) : null}
      </PageHead>
      {data.years.length > 1 ? (
        <form method="get" className="toolbar">
          <label htmlFor="an-registru" className="sr-only">
            Anul registrului
          </label>
          <AutoSubmitSelect id="an-registru" name="an" defaultValue={year ? String(year) : ""} className="!w-auto !flex-none">
            <option value="">Toți anii</option>
            {data.years.map((y) => (
              <option key={y} value={y}>
                Registrul {y}
              </option>
            ))}
          </AutoSubmitSelect>
          <noscript>
            <button type="submit" className="btn btn-sm">
              Arată
            </button>
          </noscript>
        </form>
      ) : null}
      {data.items.length === 0 ? (
        <EmptyState title="Registrul de ieșire e gol">
          Generați o adeverință sau un certificat dintr-un șablon; datele se completează automat din registrul de persoane.
        </EmptyState>
      ) : (
        <div className="list">
          {data.items.map((x) => {
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
                  </div>
                </div>
                <span className="tag">{DOCUMENT_TYPE_LABEL[x.tip].split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      )}
      <Pager
        pathname="/documente"
        params={{ an: year ? String(year) : undefined }}
        page={data.page}
        pages={data.pages}
        summary={`${data.total} documente`}
      />
    </>
  );
}
