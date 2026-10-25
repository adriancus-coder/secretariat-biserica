import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { idSchema } from "@/lib/validation";
import { groupMemberOptions } from "@/server/queries/groups-notes";
import { roleHolders } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { GroupForm } from "../group-form";

export const metadata: Metadata = { title: "Grup nou" };

export default async function NewGroupPage({ searchParams }: PageProps<"/grupuri/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  // "Creează din funcție": the holders of the role are copied once into the new group (no live link).
  const roleId = typeof sp.functie === "string" && idSchema.safeParse(sp.functie).success ? sp.functie : null;
  const role = roleId ? await ctx.db.churchRole.findUnique({ where: { id: roleId }, select: { id: true, nume: true } }) : null;
  const selected = role ? await roleHolders(ctx, role.id) : [];
  const people = await groupMemberOptions(ctx, selected);
  return (
    <>
      <BackLink href="/grupuri">Grupuri</BackLink>
      <PageHead title={role ? `Grup nou din funcția „${role.nume}”` : "Grup nou"} />
      {role ? (
        <p className="hint mb-4">
          Persoanele care au acum funcția „{role.nume}” sunt bifate ({selected.length}). Grupul este o copie: schimbările ulterioare ale funcției nu
          îl modifică.
        </p>
      ) : null}
      <GroupForm
        id={null}
        initial={{ nume: role?.nume ?? "", responsabil: "", descriere: "" }}
        selected={selected}
        people={people}
        cancelHref="/grupuri"
      />
    </>
  );
}
