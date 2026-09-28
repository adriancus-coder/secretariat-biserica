import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getGroup, groupMemberOptions } from "@/server/queries/groups-notes";
import { requireCtx } from "@/server/session";
import { GroupForm } from "../../group-form";

export const metadata: Metadata = { title: "Editează grupul" };

export default async function EditGroupPage({ params }: PageProps<"/grupuri/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const g = await getGroup(ctx, id);
  if (!g) notFound();
  const selected = g.membri.map((m) => m.id);
  const people = await groupMemberOptions(ctx, selected);
  return (
    <>
      <BackLink href={`/grupuri/${id}`}>{g.nume}</BackLink>
      <PageHead title="Editează grupul" />
      <GroupForm
        id={id}
        initial={{ nume: g.nume, responsabil: g.responsabil, descriere: g.descriere }}
        selected={selected}
        people={people}
        cancelHref={`/grupuri/${id}`}
      />
    </>
  );
}
