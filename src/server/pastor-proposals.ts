import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { memberName } from "@/lib/format";
import { PERSON_PROPOSAL_LABEL } from "@/lib/labels";
import { after } from "next/server";
import { writeAudit } from "./audit";
import { notifyChurch } from "./push";
import { ActionError, type Ctx } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];
type ProposalKind = keyof typeof PERSON_PROPOSAL_LABEL;

/**
 * "Propune acceptarea" (Statut art. 23 alin. 3): the secretary's person form is stored on the
 * application, which waits for the pastor (PROPUSA). Proposing again replaces the stored form.
 */
export async function proposeApplication(ctx: Ctx, applicationId: string, entries: Record<string, string>) {
  await ctx.db.$transaction(async (tx) => {
    const app = await tx.application.findUnique({ where: { id: applicationId }, select: { status: true, nume: true, prenume: true } });
    if (!app) throw new ActionError("Cererea nu mai există.");
    const r = await tx.application.updateMany({
      where: { id: applicationId, status: { in: ["PENDING", "PROPUSA"] } },
      data: { status: "PROPUSA", propunere: entries as Prisma.InputJsonObject, propusLa: new Date(), propusDeId: ctx.user.id },
    });
    if (r.count !== 1) throw new ActionError("Cererea a fost deja procesată.");
    await writeAudit(tx, ctx.user, {
      entity: "APPLICATION",
      entityId: applicationId,
      entityLabel: memberName(app),
      action: "UPDATE",
      fields: ["stare"],
      before: { stare: app.status },
      after: { stare: "PROPUSA" },
      ...(app.status === "PROPUSA" ? { extra: { observatie: "propunere actualizată" } } : {}),
    });
  });
  const churchId = ctx.user.churchId;
  after(() => notifyChurch(churchId, "PROPOSAL"));
}

const proposalAuditTarget = (personId: string | null, proposalId: string) =>
  personId ? { entity: "PERSON" as const, entityId: personId } : { entity: "APPLICATION" as const, entityId: proposalId };

/**
 * A Reabilitare spirituală entry or an Excludere exit saved by a non-pastor: the form waits for the
 * pastor as a `PersonProposal`, replacing a waiting proposal for the same person. Nothing else of the
 * form is applied until then.
 */
export async function proposeForPastor(ctx: Ctx, p: { kind: ProposalKind; personId: string | null; nume: string; entries: Record<string, string> }) {
  await ctx.db.$transaction(async (tx) => {
    if (p.personId) await tx.personProposal.deleteMany({ where: { personId: p.personId, status: "PROPUSA" } });
    const created = await tx.personProposal.create({
      data: { churchId: ctx.user.churchId, kind: p.kind, personId: p.personId, nume: p.nume, formular: p.entries as Prisma.InputJsonObject, propusDeId: ctx.user.id },
    });
    await writeAudit(tx, ctx.user, {
      ...proposalAuditTarget(p.personId, created.id),
      entityLabel: p.nume,
      action: "UPDATE",
      fields: ["propunerePastor"],
      before: { propunerePastor: "" },
      after: { propunerePastor: `${PERSON_PROPOSAL_LABEL[p.kind]} — trimisă pastorului` },
    });
  });
  const churchId = ctx.user.churchId;
  after(() => notifyChurch(churchId, "PROPOSAL"));
}

/** A plain save of the person while a proposal waits: the proposal is withdrawn (audited). */
export async function withdrawProposals(ctx: Ctx, personId: string) {
  await ctx.db.$transaction(async (tx) => {
    const waiting = await tx.personProposal.findMany({ where: { personId, status: "PROPUSA" }, select: { kind: true, nume: true } });
    if (!waiting.length) return;
    await tx.personProposal.deleteMany({ where: { personId, status: "PROPUSA" } });
    await writeAudit(tx, ctx.user, {
      entity: "PERSON",
      entityId: personId,
      entityLabel: waiting[0].nume,
      action: "UPDATE",
      fields: ["propunerePastor"],
      before: { propunerePastor: `${PERSON_PROPOSAL_LABEL[waiting[0].kind]} — trimisă pastorului` },
      after: { propunerePastor: "retrasă" },
    });
  });
}

/** The pastor's approval: the proposal becomes ACCEPTED in the save's own transaction. */
export async function settleProposal(tx: Tx, ctx: Ctx, proposalId: string, personId: string) {
  const r = await tx.personProposal.updateMany({
    where: { id: proposalId, status: "PROPUSA" },
    data: { status: "ACCEPTED", personId, decidedAt: new Date(), decidedById: ctx.user.id },
  });
  if (r.count !== 1) throw new ActionError("Propunerea a fost deja procesată.");
}

/** Waiting proposals for the pastor: applications and person changes. */
export async function pastorQueueCounts(db: Ctx["db"]) {
  const [applications, persons] = await Promise.all([db.application.count({ where: { status: "PROPUSA" } }), db.personProposal.count({ where: { status: "PROPUSA" } })]);
  return { applications, persons };
}

