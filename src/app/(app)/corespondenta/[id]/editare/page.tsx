import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { documentOptions, getCorrespondence } from "@/server/queries/correspondence";
import { personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { CorrespondenceForm } from "../../correspondence-form";

export const metadata: Metadata = { title: "Editează înregistrarea" };

export default async function EditCorrespondencePage({ params }: PageProps<"/corespondenta/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const r = await getCorrespondence(ctx, id);
  if (!r) notFound();
  const [people, documents] = await Promise.all([personOptions(ctx), documentOptions(ctx)]);
  return (
    <>
      <BackLink href={`/corespondenta/${r.id}`}>Înregistrarea</BackLink>
      <PageHead title={`Editează nr. ${r.nr}/${r.an}`} />
      <section className="card">
        <CorrespondenceForm
          id={r.id}
          initial={{
            nr: String(r.nr),
            data: r.data,
            directie: r.directie,
            dela: r.dela,
            catre: r.catre,
            subiect: r.subiect,
            rezolvare: r.rezolvare,
            documentId: r.documentId ?? "",
            raspunsLaId: r.raspunsLaId ?? "",
            personId: r.personId ?? "",
          }}
          nextNr={String(r.nr)}
          people={people.map((p) => ({ id: p.id, name: p.name }))}
          documents={documents}
          answering={r.raspunsLa ? `Răspuns la intrarea nr. ${r.raspunsLa.nr}/${r.raspunsLa.an} — ${r.raspunsLa.subiect}` : null}
          cancelHref={`/corespondenta/${r.id}`}
        />
      </section>
    </>
  );
}
