import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getChurch } from "@/server/queries/church";
import { getEvent } from "@/server/queries/events";
import { requireCtx } from "@/server/session";
import { EventForm } from "../../event-form";

export const metadata: Metadata = { title: "Editează evenimentul" };

export default async function EditEventPage({ params }: PageProps<"/calendar/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const [e, church] = await Promise.all([getEvent(ctx, id), getChurch(ctx)]);
  if (!e) notFound();
  return (
    <>
      <BackLink href={`/calendar/${id}`}>{e.titlu}</BackLink>
      <PageHead title="Editează evenimentul" />
      <EventForm
        id={id}
        initial={{
          titlu: e.titlu,
          tip: e.tip,
          data: e.data,
          ora: e.ora,
          loc: e.loc,
          invitat: e.invitat,
          responsabil: e.responsabil,
          descriere: e.descriere,
          agapaActiva: e.agapaActiva ? "on" : "",
          agapaResponsabil: e.agapaResponsabil,
          agapaPersoane: e.agapaPersoane === null ? "" : String(e.agapaPersoane),
        }}
        contributii={e.contributii}
        tipuri={church.nomen.tipuriEvenimente}
        cancelHref={`/calendar/${id}`}
      />
    </>
  );
}
