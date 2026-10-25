import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, EmptyState, PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { todayIso } from "@/lib/dates";
import { permissions } from "@/lib/permissions";
import { listCampaigns } from "@/server/queries/campaigns";
import { requireCtx } from "@/server/session";
import { CampaignForm } from "./campaign-form";

export const metadata: Metadata = { title: "Actualizare date" };

/** The data-update campaigns (secretariat; starting one: administrators). */
export default async function CampaignsPage() {
  const ctx = await requireCtx("write");
  const campaigns = await listCampaigns(ctx);
  const today = todayIso();
  const [y, m, d] = today.split("-").map(Number);
  const inAMonth = new Date(Date.UTC(y, m - 1, d + 30)).toISOString().slice(0, 10);
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Actualizare date" sub="Fiecare adult își verifică datele și pe ale copiilor minori, iar secretariatul aprobă modificările" />
      {campaigns.length ? (
        <ul className="list mb-4">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/setari/actualizare-date/${c.id}`} className="item">
                <span className="grow">
                  <b>{c.nume}</b>
                  <span className="hint block">
                    până la {fmt(c.deadline)} · {c.answered} din {c.total} au răspuns
                  </span>
                </span>
                <span className={c.status === "ACTIVE" ? "tag tag-ok" : "tag"}>{c.status === "ACTIVE" ? "Activă" : "Închisă"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nicio campanie" />
      )}
      {permissions.admin(ctx.user.role) ? (
        <div className="card">
          <h3>Campanie nouă</h3>
          <CampaignForm defaultDeadline={inAMonth} />
        </div>
      ) : (
        <p className="hint">O campanie nouă poate fi pornită doar de administrator.</p>
      )}
    </>
  );
}
