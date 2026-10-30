"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { defaultSendSubject, meetingSendInput, meetingSendSchema } from "@/lib/schemas/meeting-send";
import { fmtDot } from "@/domain/print";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { isEmailConfigured, MAX_ATTACHMENT_BYTES, sendMinutesEmail } from "../email";
import { meetingPdfFileName, renderMeetingPdf } from "../pdf/meeting";
import { getChurch } from "../queries/church";
import { getMeeting } from "../queries/meetings";
import { sharedRateLimiter } from "../rate-limit";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/** 20 sends per church per hour. */
const sendLimiter = () => sharedRateLimiter("minutes-send", { limit: 20, windowMs: 60 * 60 * 1000 });

/** E-mails the minutes (PDF attached by default) and records the send on the meeting. */
export async function sendMinutesAction(meetingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    if (!isEmailConfigured()) throw new ActionError("Trimiterea pe e-mail nu este configurată pentru această aplicație.");
    const input = parseOrThrow(meetingSendSchema, meetingSendInput(formData));
    const [m, church] = await Promise.all([getMeeting(ctx, meetingId), getChurch(ctx)]);
    if (!m) throw new ActionError("Procesul-verbal nu mai există.");

    let attachment: { filename: string; content: Buffer } | undefined;
    if (input.pdf) {
      const content = await renderMeetingPdf(m, church);
      if (content.length > MAX_ATTACHMENT_BYTES) {
        throw new ActionError("PDF-ul depășește 10 MB și nu poate fi atașat. Debifați „Atașează PDF” sau trimiteți-l manual.");
      }
      attachment = { filename: meetingPdfFileName(m, church.slug), content };
    }
    if (!sendLimiter().hit(ctx.user.churchId)) {
      throw new ActionError("Au fost trimise prea multe e-mailuri în ultima oră. Încercați din nou mai târziu.");
    }

    const dataLabel = fmtDot(m.data);
    const delivery = await sendMinutesEmail({
      to: input.to,
      subject: defaultSendSubject({ nr: m.nr, anRegistru: m.anRegistru, dataLabel }, church.nume),
      churchName: church.nume,
      tip: m.tip,
      dataLabel,
      note: input.nota,
      attachment,
      copie: m.importat,
    });
    const sent = delivery.result === "sent";
    const label = `${m.nr != null ? `PV nr. ${m.nr}/${m.anRegistru} — ` : ""}${m.titlu || m.tip} (${m.data})`;
    await ctx.db.$transaction(async (tx) => {
      // MeetingSend has no churchId: it is created through the church-scoped meeting.
      await tx.meeting.update({
        where: { id: meetingId },
        data: {
          sends: {
            create: {
              to: input.to,
              sentByUserId: ctx.user.id,
              resendId: delivery.id ?? null,
              status: sent ? "SENT" : "FAILED",
              error: sent ? null : (delivery.error ?? delivery.result),
            },
          },
        },
      });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: label,
        action: "UPDATE",
        fields: [],
        // The number of recipients only: the addresses stay on the send row (shown to write roles).
        extra: {
          trimis: input.to.length === 1 ? "o adresă" : `${input.to.length} adrese`,
          rezultat: sent ? (attachment ? "trimis cu PDF" : "trimis fără PDF") : "netrimis",
        },
      });
    });
    revalidatePath(`/procese-verbale/${meetingId}`);
    if (!sent) throw new ActionError("E-mailul nu a putut fi trimis. Încercați din nou mai târziu sau trimiteți PDF-ul manual.");
    const n = input.to.length;
    return { ok: true, message: n === 1 ? "Procesul-verbal a fost trimis." : `Procesul-verbal a fost trimis la ${n} adrese.` };
  });
}
