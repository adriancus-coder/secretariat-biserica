import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getGroup, groupMemberOptions, roleHoldersMap } from "@/server/queries/groups-notes";
import { groupRoleChoices } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { GroupForm } from "../../group-form";

export const metadata: Metadata = { title: "Editează grupul" };

export default async function EditGroupPage({ params }: PageProps<"/grupuri/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const g = await getGroup(ctx, id);
  if (!g) notFound();
  const selected = g.membri.map((m) => m.id);
  const [people, roles, holders] = await Promise.all([groupMemberOptions(ctx, selected), groupRoleChoices(ctx, [g.functieId, g.functieLiderId]), roleHoldersMap(ctx)]);
  return (
    <>
      <BackLink href={`/grupuri/${id}`}>{g.nume}</BackLink>
      <PageHead title="Editează grupul" />
      <GroupForm
        id={id}
        initial={{ nume: g.nume, functieId: g.functieId ?? "", functieLiderId: g.functieLiderId ?? "", responsabilId: g.responsabilId ?? "", responsabil: g.responsabil, descriere: g.descriere }}
        roles={roles}
        manual={g.membri.filter((m) => !m.auto).map((m) => m.id)}
        holders={holders}
        people={people}
        cancelHref={`/grupuri/${id}`}
      />
    </>
  );
}
