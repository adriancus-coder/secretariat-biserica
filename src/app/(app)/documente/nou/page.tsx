import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { todayIso } from "@/lib/dates";
import { DOCUMENT_TYPES, type DocumentTypeKey } from "@/lib/labels";
import { buildDocumentDraft, nextDocumentNumber } from "@/server/queries/documents";
import { personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { DocumentForm } from "../document-form";

export const metadata: Metadata = { title: "Document nou" };

export default async function NewDocumentPage({ searchParams }: PageProps<"/documente/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const today = todayIso();
  const tip: DocumentTypeKey = (DOCUMENT_TYPES as readonly string[]).includes(String(sp.tip)) ? (sp.tip as DocumentTypeKey) : "adeverinta";
  const people = await personOptions(ctx);
  const personId = typeof sp.persoana === "string" && people.some((p) => p.id === sp.persoana) ? sp.persoana : "";
  const an = Number(sp.an);
  const anRaport = tip === "raport" ? String(Number.isInteger(an) && an > 1800 && an < 2201 ? an : Number(today.slice(0, 4))) : "";
  const [draft, nextNr] = await Promise.all([
    buildDocumentDraft(ctx, {
      tip,
      personId: personId || null,
      catre: "",
      scop: "",
      anRaport: anRaport ? Number(anRaport) : null,
      data: today,
    }),
    nextDocumentNumber(ctx, Number(today.slice(0, 4))),
  ]);

  return (
    <>
      <BackLink href="/documente">Documente</BackLink>
      <PageHead title={tip === "raport" ? `Dare de seamă ${anRaport}` : "Document nou"} />
      <DocumentForm
        id={null}
        initial={{ tip, nr: "", data: today, personId, catre: "", scop: "", titlu: draft.titlu, text: draft.text, anRaport }}
        people={people}
        nextNr={nextNr}
        cancelHref={personId ? `/persoane/${personId}` : "/documente"}
      />
    </>
  );
}
