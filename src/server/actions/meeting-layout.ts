"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/lib/form-state";
import { layoutSummary, pageLayoutInput, pageLayoutSchema, storedLayout } from "@/lib/page-layout";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { getChurch } from "../queries/church";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

const LOCKED = "Procesul-verbal este închis. Administratorul îl poate redeschide pentru modificări.";

/**
 * "Așezare în pagină" of a meeting. The button pressed (`scop`) decides:
 * - "pv": this meeting's own layout (write; not on a closed meeting);
 * - "implicit": the church's default for every meeting without its own (admin);
 * - "resetare": this meeting goes back to the church's default.
 */
export async function saveMeetingLayoutAction(meetingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const scop = String(formData.get("scop") ?? "pv");
    const ctx = await actionCtx(scop === "implicit" ? "admin" : "write");
    parseOrThrow(idSchema, meetingId);
    const meeting = await ctx.db.meeting.findUnique({ where: { id: meetingId }, select: { id: true, nr: true, anRegistru: true, tip: true, locked: true, layout: true } });
    if (!meeting) throw new ActionError("Procesul-verbal nu mai există.");
    const church = await getChurch(ctx);
    const label = meeting.nr !== null ? `PV nr. ${meeting.nr}/${meeting.anRegistru}` : `Proces-verbal (${meeting.tip})`;

    if (scop === "implicit") {
      const layout = parseOrThrow(pageLayoutSchema, pageLayoutInput(formData));
      await prisma.$transaction(async (tx) => {
        // Church is not a tenant model: the id comes from the session.
        await tx.church.update({ where: { id: ctx.user.churchId }, data: { pvLayout: layout } });
        await writeAudit(tx, ctx.user, {
          entity: "SETTINGS",
          entityId: ctx.user.churchId,
          entityLabel: "Așezarea în pagină a proceselor-verbale",
          action: "UPDATE",
          fields: ["asezare"],
          before: { asezare: layoutSummary(church.pvLayout) },
          after: { asezare: layoutSummary(layout) },
        });
      });
      revalidatePath("/procese-verbale", "layout");
      return { ok: true, message: "Așezarea a fost salvată ca implicită pentru procesele-verbale fără așezare proprie." };
    }

    if (meeting.locked) throw new ActionError(LOCKED);
    const before = layoutSummary(storedLayout(meeting.layout, church.pvLayout));
    const layout = scop === "resetare" ? null : parseOrThrow(pageLayoutSchema, pageLayoutInput(formData));
    await ctx.db.$transaction(async (tx) => {
      await tx.meeting.update({ where: { id: meetingId }, data: { layout: layout ?? Prisma.DbNull } });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: label,
        action: "UPDATE",
        fields: ["asezare"],
        before: { asezare: before },
        after: { asezare: layout ? layoutSummary(layout) : `implicită (${layoutSummary(church.pvLayout)})` },
      });
    });
    revalidatePath(`/procese-verbale/${meetingId}`, "layout");
    return { ok: true, message: layout ? "Așezarea în pagină a fost salvată pentru acest proces-verbal." : "Procesul-verbal folosește din nou așezarea implicită." };
  });
}
