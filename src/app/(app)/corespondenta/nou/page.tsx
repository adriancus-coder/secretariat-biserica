import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { todayIso } from "@/lib/dates";
import { idSchema } from "@/lib/validation";
import { nextFreeCorrespondenceNumber } from "@/server/doc-numbering";
import { documentOptions } from "@/server/queries/correspondence";
import { personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { CorrespondenceForm } from "../correspondence-form";

export const metadata: Metadata = { title: "Înregistrare în registrul de corespondență" };

/** "+ Înregistrează intrare / ieșire", and "Răspunde" (an exit linked to the entry, addressed to its sender). */
export default async function NewCorrespondencePage({ searchParams }: PageProps<"/corespondenta/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const today = todayIso();
  const reply =
    typeof sp.raspunsLa === "string" && idSchema.safeParse(sp.raspunsLa).success
      ? await ctx.db.correspondence.findFirst({ where: { id: sp.raspunsLa, directie: "INTRARE" }, select: { id: true, nr: true, an: true, dela: true, subiect: true, personId: true } })
      : null;
  const directie = reply ? "IESIRE" : sp.directie === "IESIRE" ? "IESIRE" : "INTRARE";
  const [people, documents, nextNr] = await Promise.all([
    personOptions(ctx),
    documentOptions(ctx),
    nextFreeCorrespondenceNumber(ctx.db, ctx.user.churchId, Number(today.slice(0, 4))),
  ]);
  return (
    <>
      <BackLink href={reply ? `/corespondenta/${reply.id}` : "/corespondenta"}>{reply ? "Intrarea" : "Corespondență"}</BackLink>
      <PageHead title={reply ? "Răspuns" : directie === "INTRARE" ? "Înregistrează intrare" : "Înregistrează ieșire"} />
      <section className="card">
        <CorrespondenceForm
          id={null}
          initial={{
            nr: "",
            data: today,
            directie,
            dela: "",
            catre: reply?.dela ?? "",
            subiect: reply ? `Răspuns: ${reply.subiect}` : "",
            rezolvare: "",
            documentId: "",
            raspunsLaId: reply?.id ?? "",
            personId: reply?.personId ?? "",
          }}
          nextNr={String(nextNr)}
          people={people.map((p) => ({ id: p.id, name: p.name }))}
          documents={documents}
          answering={reply ? `Răspuns la intrarea nr. ${reply.nr}/${reply.an} — ${reply.subiect}` : null}
          cancelHref={reply ? `/corespondenta/${reply.id}` : "/corespondenta"}
        />
      </section>
    </>
  );
}
