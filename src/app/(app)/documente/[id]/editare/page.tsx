import { StepUpGate } from "@/components/passkey/step-up-gate";
import { hasStepUp, stepUpMethod } from "@/server/step-up";
import type { Metadata } from "next";
import { permissions } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getDocument, nextDocumentNumber } from "@/server/queries/documents";
import { personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { DocumentForm } from "../../document-form";

export const metadata: Metadata = { title: "Editează documentul" };

export default async function EditDocumentPage({ params }: PageProps<"/documente/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const doc = await getDocument(ctx, id);
  if (!doc) notFound();
  // GENERATED-EDIT: a registered disciplinary act asks for the step-up first.
  if (doc.confidential && !(await hasStepUp(ctx.user))) {
    return (
      <>
        <BackLink href="/documente">Documente</BackLink>
        <StepUpGate method={await stepUpMethod(ctx.user.id)} what="Documentul conține date disciplinare confidențiale." />
      </>
    );
  }
  const [people, nextNr] = await Promise.all([personOptions(ctx), nextDocumentNumber(ctx, doc.anRegistru)]);
  return (
    <>
      <BackLink href={`/documente/${id}`}>
        Nr. {doc.nr}/{doc.anRegistru}
      </BackLink>
      <PageHead title="Editează documentul" />
      <DocumentForm
        id={id}
        initial={{
          tip: doc.tip,
          nr: String(doc.nr),
          data: doc.data,
          personId: doc.personId ?? "",
          catre: doc.catre,
          scop: doc.scop,
          titlu: doc.titlu,
          text: doc.text,
          textRich: doc.textRich,
          anRaport: doc.anRaport ? String(doc.anRaport) : "",
          exceptieDomiciliu: doc.exceptieDomiciliu,
        }}
        canDiscipline={permissions.disciplina(ctx.user)}
        people={people}
        nextNr={nextNr}
        cancelHref={`/documente/${id}`}
      />
    </>
  );
}
