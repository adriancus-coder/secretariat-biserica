import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { initial } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { listGroups } from "@/server/queries/groups-notes";
import { listRoles } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Grupuri" };

export default async function GroupsPage() {
  const ctx = await requireCtx();
  const canWrite = permissions.write(ctx.user.role);
  const [groups, roles] = await Promise.all([listGroups(ctx), canWrite ? listRoles(ctx) : Promise.resolve([])]);
  const heldRoles = roles.filter((r) => r.holders > 0);
  return (
    <>
      <PageHead title="Grupuri" sub="Cor, tineret, comitet, slujiri">
        {canWrite ? (
          <Link href="/grupuri/nou" className="btn btn-primary">
            + Grup
          </Link>
        ) : null}
      </PageHead>
      {heldRoles.length ? (
        <form method="get" action="/grupuri/nou" className="toolbar items-center" aria-label="Creează un grup din funcție">
          <select name="functie" aria-label="Funcția" defaultValue={heldRoles[0].id}>
            {heldRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nume} ({r.holders})
              </option>
            ))}
          </select>
          <button type="submit" className="btn">
            Creează din funcție
          </button>
        </form>
      ) : null}
      {groups.length === 0 ? (
        <EmptyState title="Niciun grup">Creați primul grup: comitet, cor, tineret…</EmptyState>
      ) : (
        <div className="list">
          {groups.map((g) => (
            <Link key={g.id} href={`/grupuri/${g.id}`} className="item">
              <div className="av" aria-hidden="true">
                {initial(g.nume)}
              </div>
              <div className="body">
                <div className="t">{g.nume}</div>
                <div className="m">
                  {g.count} persoane{g.responsabil ? ` · resp. ${g.responsabil}` : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
