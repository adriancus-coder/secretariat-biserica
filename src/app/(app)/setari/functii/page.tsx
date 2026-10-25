import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { permissions } from "@/lib/permissions";
import { listRoleGroups } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { NewGroupForm, RoleGroupCard } from "./role-controls";

export const metadata: Metadata = { title: "Funcții și slujiri" };

export default async function ChurchRolesPage() {
  const ctx = await requireCtx();
  const groups = await listRoleGroups(ctx);
  const canEdit = permissions.admin(ctx.user.role);
  const active = groups.flatMap((g) => g.roles).filter((r) => r.active).length;
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Funcții și slujiri" sub={`${groups.length} grupuri · ${active} intrări active`} />
      <p className="hint mb-4">
        Fiecare grup apare ca un bloc pe fișa persoanei. O intrare atribuită cuiva nu poate fi dezactivată, iar un grup cu intrări active
        nu poate fi dezactivat. Comitetul se bifează direct pe fișa persoanei („Membru în comitet”).
      </p>
      {groups.map((g, i) => (
        <RoleGroupCard key={g.id} group={g} first={i === 0} last={i === groups.length - 1} canEdit={canEdit} />
      ))}
      {canEdit ? (
        <div className="card mt-5">
          <h3>Adaugă un grup</h3>
          <NewGroupForm />
        </div>
      ) : (
        <p className="hint mt-4">Doar administratorul poate modifica funcțiile și slujirile.</p>
      )}
    </>
  );
}
