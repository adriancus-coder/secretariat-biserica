import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { idSchema } from "@/lib/validation";
import { groupMemberOptions, roleHoldersMap } from "@/server/queries/groups-notes";
import { groupRoleChoices } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { GroupForm } from "../group-form";

export const metadata: Metadata = { title: "Grup nou" };

export default async function NewGroupPage({ searchParams }: PageProps<"/grupuri/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  // "Creează din funcție": the group is linked to the role and keeps its holders as automatic members.
  const roleId = typeof sp.functie === "string" && idSchema.safeParse(sp.functie).success ? sp.functie : null;
  const role = roleId ? await ctx.db.churchRole.findUnique({ where: { id: roleId }, select: { id: true, nume: true } }) : null;
  const [people, roles, holders] = await Promise.all([groupMemberOptions(ctx, []), groupRoleChoices(ctx, [role?.id ?? null]), roleHoldersMap(ctx)]);
  return (
    <>
      <BackLink href="/grupuri">Grupuri</BackLink>
      <PageHead title={role ? `Grup nou din funcția „${role.nume}”` : "Grup nou"} />
      {role ? (
        <p className="hint mb-4">
          Persoanele care au funcția „{role.nume}” sunt membri automați ({holders[role.id]?.length ?? 0}): grupul se actualizează singur când funcția
          este dată sau luată cuiva pe fișa persoanei.
        </p>
      ) : null}
      <GroupForm
        id={null}
        initial={{ nume: role?.nume ?? "", functieId: role?.id ?? "", functieLiderId: "", responsabilId: "", responsabil: "", descriere: "" }}
        manual={[]}
        people={people}
        roles={roles}
        holders={holders}
        cancelHref="/grupuri"
      />
    </>
  );
}
