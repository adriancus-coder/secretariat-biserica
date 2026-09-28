import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { initial } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { listGroups } from "@/server/queries/groups-notes";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Grupuri" };

export default async function GroupsPage() {
  const ctx = await requireCtx();
  const groups = await listGroups(ctx);
  return (
    <>
      <PageHead title="Grupuri" sub="Cor, tineret, comitet, slujiri">
        {permissions.write(ctx.user.role) ? (
          <Link href="/grupuri/nou" className="btn btn-primary">
            + Grup
          </Link>
        ) : null}
      </PageHead>
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
