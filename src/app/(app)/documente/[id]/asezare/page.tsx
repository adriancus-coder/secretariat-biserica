import { visibleDocument } from "@/server/confidential-documents";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LayoutEditor } from "@/components/layout-editor";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { resolveLayout } from "@/lib/page-layout";
import { permissions } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { saveDocumentLayoutAction } from "@/server/actions/document-layout";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Așezare în pagină" };

/** "Așezare în pagină" of a registered document: the same model and preview as the minutes'. */
export default async function DocumentLayoutPage({ params }: PageProps<"/documente/[id]/asezare">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const ctx = await requireCtx("write");
  const [doc, church] = await Promise.all([
    ctx.db.document.findUnique({ where: { id }, select: { id: true, nr: true, anRegistru: true, tip: true, titlu: true, layout: true, confidential: true } }).then((d) => visibleDocument(ctx.user, d)),
    getChurch(ctx),
  ]);
  if (!doc) notFound();
  return (
    <>
      <BackLink href={`/documente/${id}`}>
        Nr. {doc.nr}/{doc.anRegistru} — {doc.titlu || DOCUMENT_TYPE_LABEL[doc.tip]}
      </BackLink>
      <PageHead title="Așezare în pagină" sub="Pentru PDF și pentru documentul Word" />
      <LayoutEditor
        subject={{ pdfBase: `/pdf/document/${id}`, name: "acest document", plural: "documente" }}
        action={saveDocumentLayoutAction.bind(null, id)}
        initial={resolveLayout(church.docLayout, doc.layout)}
        churchDefault={church.docLayout}
        hasOwn={doc.layout !== null}
        locked={false}
        canSetDefault={permissions.admin(ctx.user.role)}
        fit={{ tinta: "document", id }}
      />
    </>
  );
}
