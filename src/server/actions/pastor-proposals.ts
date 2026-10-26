"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { initialFormState, type FormState, type PersonFormState } from "@/lib/form-state";
import { PERSON_PROPOSAL_LABEL } from "@/lib/labels";
import { entriesFormData } from "@/lib/person-proposal";
import { idSchema, text } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { savePersonAction } from "./persons";
import { parseOrThrow, runFormAction } from "./run";

/** The pastor's context, or the refusal as a form message. */
async function pastorCtx(): Promise<Ctx | PersonFormState> {
  try {
    return await actionCtx("pastor");
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, message: e.message };
    throw e;
  }
}

/**
 * "Aprobă primirea" (pastors, Statut art. 23 alin. 3): the person form the secretary proposed is
 * saved as it was prepared — the person enters the register and the application is accepted.
 */
export async function approveApplicationAction(applicationId: string): Promise<PersonFormState> {
  const ctx = await pastorCtx();
  if (!("db" in ctx)) return ctx;
  if (!idSchema.safeParse(applicationId).success) return { ok: false, message: "Cerere necunoscută." };
  const app = await ctx.db.application.findUnique({ where: { id: applicationId }, select: { status: true, propunere: true } });
  if (!app || app.status !== "PROPUSA" || !app.propunere) return { ok: false, message: "Cererea nu are o propunere de aprobat." };
  // The duplicate check was answered when the secretary proposed it.
  return savePersonAction(null, initialFormState, entriesFormData(app.propunere, { cerere: applicationId, fortat: "1" }));
}

/** "Confirmă" (pastors): the reabilitare / excludere form is saved as the secretary prepared it. */
export async function approveProposalAction(proposalId: string): Promise<PersonFormState> {
  const ctx = await pastorCtx();
  if (!("db" in ctx)) return ctx;
  if (!idSchema.safeParse(proposalId).success) return { ok: false, message: "Propunere necunoscută." };
  const pr = await ctx.db.personProposal.findUnique({ where: { id: proposalId }, select: { status: true, personId: true, formular: true } });
  if (!pr || pr.status !== "PROPUSA") return { ok: false, message: "Propunerea a fost deja procesată." };
  return savePersonAction(pr.personId, initialFormState, entriesFormData(pr.formular, { propunere: proposalId, fortat: "1" }));
}

/** "Respinge" (pastors) a reabilitare / excludere proposal, with a reason the secretary sees. */
export async function rejectProposalAction(proposalId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let back = "/cereri?stare=propuse";
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("pastor");
    parseOrThrow(idSchema, proposalId);
    const motiv = parseOrThrow(text(500, "Motivul"), formData.get("motiv") ?? "");
    await ctx.db.$transaction(async (tx) => {
      const pr = await tx.personProposal.findUnique({ where: { id: proposalId } });
      if (!pr) throw new ActionError("Propunerea nu mai există.");
      const r = await tx.personProposal.updateMany({
        where: { id: proposalId, status: "PROPUSA" },
        data: { status: "REJECTED", motivRespingere: motiv, decidedAt: new Date(), decidedById: ctx.user.id },
      });
      if (r.count !== 1) throw new ActionError("Propunerea a fost deja procesată.");
      await writeAudit(tx, ctx.user, {
        ...(pr.personId ? { entity: "PERSON" as const, entityId: pr.personId } : { entity: "APPLICATION" as const, entityId: pr.id }),
        entityLabel: pr.nume,
        action: "UPDATE",
        fields: ["propunerePastor"],
        before: { propunerePastor: `${PERSON_PROPOSAL_LABEL[pr.kind]} — trimisă pastorului` },
        after: { propunerePastor: `respinsă${motiv ? `: ${motiv}` : ""}` },
      });
      if (pr.personId) back = `/persoane/${pr.personId}`;
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}salvat=1`);
}
