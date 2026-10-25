import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { permissions } from "@/lib/permissions";
import { listRoles } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { NewRoleForm, RoleRowControls } from "./role-controls";

export const metadata: Metadata = { title: "Funcții în biserică" };

export default async function ChurchRolesPage() {
  const ctx = await requireCtx();
  const roles = await listRoles(ctx);
  const canEdit = permissions.admin(ctx.user.role);
  const active = roles.filter((r) => r.active);
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Funcții în biserică" sub={`${active.length} active · ${active.filter((r) => r.inCommittee).length} în comitet`} />
      <p className="hint mb-4">
        Funcțiile se atribuie din fișa persoanei. Cele marcate „comitet” alcătuiesc comitetul bisericii (lista de prezență la ședințele de
        comitet). O funcție atribuită cuiva nu poate fi dezactivată.
      </p>
      <div className="list">
        {roles.map((r, i) => (
          <RoleRowControls key={r.id} role={r} first={i === 0} last={i === roles.length - 1} canEdit={canEdit} />
        ))}
      </div>
      {canEdit ? (
        <div className="card mt-5">
          <h3>Adaugă o funcție</h3>
          <NewRoleForm />
        </div>
      ) : (
        <p className="hint mt-4">Doar administratorul poate modifica funcțiile.</p>
      )}
    </>
  );
}
