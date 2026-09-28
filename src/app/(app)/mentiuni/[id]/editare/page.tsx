import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getChurch } from "@/server/queries/church";
import { getNote } from "@/server/queries/groups-notes";
import { familyNames, personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { NoteForm } from "../../note-form";

export const metadata: Metadata = { title: "Editează mențiunea" };

export default async function EditNotePage({ params }: PageProps<"/mentiuni/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const [n, church, people, families] = await Promise.all([getNote(ctx, id), getChurch(ctx), personOptions(ctx), familyNames(ctx)]);
  if (!n) notFound();
  return (
    <>
      <BackLink href={`/mentiuni/${id}`}>Mențiune</BackLink>
      <PageHead title="Editează mențiunea" />
      <NoteForm
        id={id}
        initial={{ data: n.data, tip: n.tip, personId: n.personId ?? "", familie: n.familie, text: n.text }}
        people={people}
        families={families}
        tipuri={church.nomen.tipuriMentiuni}
        backToPerson={false}
        cancelHref={`/mentiuni/${id}`}
      />
    </>
  );
}
