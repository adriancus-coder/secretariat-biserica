import { hasStepUp, stepUpMethod } from "@/server/step-up";
import { StepUpGate } from "@/components/passkey/step-up-gate";
import type { Metadata } from "next";
import { formatDateTime } from "@/components/audit-trail";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { ROLE_LABEL } from "@/lib/labels";
import { isEmailConfigured } from "@/server/email";
import { requireCtx } from "@/server/session";
import { ActiveToggle, EndSessionsButton, InviteForm, ResetLinkButton, RevokeInvitation, RoleSelect, PastorControl } from "./user-controls";

export const metadata: Metadata = { title: "Utilizatori" };

export default async function UsersPage() {
  const ctx = await requireCtx("admin");
  const emailEnabled = isEmailConfigured();
  const [stepMethod, stepped] = await Promise.all([stepUpMethod(ctx.user.id), hasStepUp(ctx.user)]);
  const [users, invitations] = await Promise.all([
    ctx.db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, isPastor: true, pastorTitlu: true, active: true, lastLoginAt: true, lastLoginIp: true, createdAt: true },
    }),
    ctx.db.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { invitedBy: { select: { name: true } } },
    }),
  ]);
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Utilizatori și roluri" sub={`${users.filter((u) => u.active).length} conturi active`} />
      {!stepped ? <StepUpGate method={stepMethod} what="Rolurile și calitatea de pastor se schimbă după confirmarea identității." compact /> : null}

      <div className="card">
        <h3>Invită un utilizator</h3>
        {emailEnabled ? (
          <p className="hint mb-3">
            Persoana invitată primește pe e-mail un link personal (valabil 7 zile) și își alege singură parola.
          </p>
        ) : (
          <p className="hint mb-3">
            Se generează un link personal (valabil 7 zile) pe care îl trimiteți persoanei invitate; aceasta își alege
            singură parola. Trimiterea pe e-mail nu este configurată.
          </p>
        )}
        <InviteForm emailEnabled={emailEnabled} />
      </div>

      {invitations.length ? (
        <div className="card">
          <h3>Invitații în așteptare</h3>
          <ul>
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0 flex-wrap">
                <span className="flex-1 min-w-0">
                  <b className="font-medium">{i.email}</b> · {ROLE_LABEL[i.role]}
                  <span className="hint block !mt-0">
                    trimisă de {i.invitedBy?.name ?? "—"}, expiră {formatDateTime(i.expiresAt)}
                  </span>
                </span>
                <RevokeInvitation id={i.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="list">
        {users.map((u) => (
          <div key={u.id} className="item !cursor-default flex-wrap" style={{ opacity: u.active ? 1 : 0.6 }}>
            <div className="av" aria-hidden="true">
              {u.name[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="body">
              <div className="t">
                {u.name} {u.isPastor ? <span className="tag tag-gold">Pastor{u.pastorTitlu ? ` · ${u.pastorTitlu}` : ""}</span> : null}{" "}
                {u.id === ctx.user.id ? <span className="tag">dvs.</span> : null}{" "}
                {!u.active ? <span className="tag tag-warn">dezactivat</span> : null}
                {u.active && unusedFor90Days(u) ? <span className="tag tag-warn">Acces nefolosit de 90 de zile</span> : null}
              </div>
              <div className="m">
                {u.email} · {u.lastLoginAt ? `ultima autentificare ${formatDateTime(u.lastLoginAt)}` : "nu s-a autentificat încă"}
                {u.lastLoginIp ? ` · de la ${u.lastLoginIp}` : ""}
              </div>
            </div>
            <div className="item-actions">
              <RoleSelect userId={u.id} role={u.role} disabled={!u.active} />
              <PastorControl userId={u.id} isPastor={u.isPastor} titlu={u.pastorTitlu} disabled={!u.active} />
              {u.active ? <ResetLinkButton userId={u.id} emailEnabled={emailEnabled} /> : null}
              {u.active && u.id !== ctx.user.id ? <EndSessionsButton userId={u.id} name={u.name} /> : null}
              {u.id !== ctx.user.id ? <ActiveToggle userId={u.id} active={u.active} /> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Never signed in (account older than 90 days) or last sign-in more than 90 days ago. */
function unusedFor90Days(u: { lastLoginAt: Date | null; createdAt: Date }): boolean {
  const limit = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return (u.lastLoginAt ?? u.createdAt).getTime() < limit;
}
