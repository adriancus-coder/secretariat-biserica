"use server";

import type { FormState } from "@/lib/form-state";
import { applicationLinkSendInput, applicationLinkSendSchema } from "@/lib/schemas/application-link";
import { writeAudit } from "../audit";
import { isEmailConfigured, sendApplicationLinkEmail } from "../email";
import { getChurch } from "../queries/church";
import { sharedRateLimiter } from "../rate-limit";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/** 20 sends per church per hour. */
const sendLimiter = () => sharedRateLimiter("application-link-send", { limit: 20, windowMs: 60 * 60 * 1000 });

/** "Trimite linkul pe e-mail": the public application link to one or more addresses, audited by count only. */
export async function sendApplicationLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (!isEmailConfigured()) throw new ActionError("Trimiterea pe e-mail nu este configurată pentru această aplicație.");
    const input = parseOrThrow(applicationLinkSendSchema, applicationLinkSendInput(formData));
    const church = await getChurch(ctx);
    if (!sendLimiter().hit(ctx.user.churchId)) {
      throw new ActionError("Au fost trimise prea multe e-mailuri în ultima oră. Încercați din nou mai târziu.");
    }
    const delivery = await sendApplicationLinkEmail({ to: input.to, subject: input.subiect, message: input.mesaj, slug: church.slug });
    const sent = delivery.result === "sent";
    const n = input.to.length;
    const count = n === 1 ? "o adresă" : `${n} adrese`;
    await ctx.db.$transaction(async (tx) => {
      // Only the number of addresses is recorded, never the addresses.
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: "Linkul cererii de membru",
        action: "UPDATE",
        fields: [],
        extra: { trimis: count, rezultat: sent ? "trimis" : "netrimis" },
      });
    });
    if (!sent) throw new ActionError("E-mailul nu a putut fi trimis. Încercați din nou mai târziu sau trimiteți linkul manual.");
    return { ok: true, message: n === 1 ? "Linkul a fost trimis." : `Linkul a fost trimis la ${n} adrese.` };
  });
}
