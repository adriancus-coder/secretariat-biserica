import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getChurch } from "@/server/queries/church";
import { attendeeOptions, getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";
import { MeetingForm } from "../../meeting-form";

export const metadata: Metadata = { title: "Editează procesul-verbal" };

export default async function EditMeetingPage({ params }: PageProps<"/procese-verbale/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const [m, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!m) notFound();
  const selected = m.prezenti.map((p) => p.id);
  const people = await attendeeOptions(ctx, selected);
  return (
    <>
      <BackLink href={`/procese-verbale/${id}`}>{m.titlu || m.tip}</BackLink>
      <PageHead title="Editează procesul-verbal" />
      <MeetingForm
        id={id}
        initial={{
          titlu: m.titlu,
          tip: m.tip,
          data: m.data,
          ora: m.ora,
          loc: m.loc,
          presedinte: m.presedinte,
          invitati: m.invitati,
          ordine: m.ordine,
          discutii: m.discutii,
          hotarari: m.hotarari,
        }}
        selected={selected}
        people={people}
        tipuri={church.nomen.tipuriSedinte}
        cancelHref={`/procese-verbale/${id}`}
      />
    </>
  );
}
