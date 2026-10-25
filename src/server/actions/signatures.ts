"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { compareRo } from "@/lib/text";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { normalizeSignature, SignatureImageError } from "../signature-image";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const SIGNATURE_FIELDS = ["semnaturi", "inchis"] as const;
const LOCKED = "Procesul-verbal este închis. Doar administratorul îl poate redeschide.";

/** The meeting (church-scoped) with the names of those who signed, for the audit log. */
async function signatureView(tx: Tx, meetingId: string) {
  const m = await tx.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      titlu: true,
      tip: true,
      nr: true,
      anRegistru: true,
      data: true,
      locked: true,
      signatures: { select: { person: { select: { nume: true, prenume: true } } } },
    },
  });
  if (!m) throw new ActionError("Procesul-verbal nu mai există.");
  return {
    meeting: m,
    view: { semnaturi: m.signatures.map((s) => memberName(s.person)).sort(compareRo), inchis: m.locked },
    label: `${m.nr != null ? `PV nr. ${m.nr}/${m.anRegistru} — ` : ""}${m.titlu || m.tip} (${m.data.toISOString().slice(0, 10)})`,
  };
}

/** Saves the signature of a person present at the meeting (replacing an earlier one). */
export async function signMeetingAction(meetingId: string, personId: string, image: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    parseOrThrow(idSchema, personId);
    let png: Buffer;
    try {
      png = await normalizeSignature(image);
    } catch (e) {
      if (e instanceof SignatureImageError) throw new ActionError(e.message);
      throw e;
    }
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      // The meeting is church-scoped above; the attendee row ties the person to it.
      const present = await tx.meetingAttendee.findUnique({ where: { meetingId_personId: { meetingId, personId } }, select: { status: true } });
      if (present?.status !== "PRESENT") throw new ActionError("Doar persoanele prezente la ședință pot semna.");
      await tx.meetingSignature.upsert({
        where: { meetingId_personId: { meetingId, personId } },
        create: { meetingId, personId, imagePng: new Uint8Array(png), signedByUserId: ctx.user.id },
        update: { imagePng: new Uint8Array(png), signedAt: new Date(), signedByUserId: ctx.user.id },
      });
      const after = await signatureView(tx, meetingId);
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: after.view,
        extra: { semnatura: "adăugată" },
      });
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

export async function deleteSignatureAction(meetingId: string, personId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    parseOrThrow(idSchema, personId);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) throw new ActionError(LOCKED);
      await tx.meetingSignature.deleteMany({ where: { meetingId, personId } });
      const after = await signatureView(tx, meetingId);
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: after.view,
      });
    });
  });
  if (state.ok) revalidatePath(`/procese-verbale/${meetingId}`);
  return state;
}

/**
 * "Închide procesul-verbal": the meeting becomes read-only. With present attendees who have not
 * signed, `confirmed` must be true (the page lists them in a confirmation first).
 */
export async function lockMeetingAction(meetingId: string, confirmed: boolean): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (before.meeting.locked) return;
      const unsigned = await tx.meetingAttendee.count({ where: { meetingId, status: "PRESENT", person: { signatures: { none: { meetingId } } } } });
      if (unsigned && !confirmed) throw new ActionError(`${unsigned === 1 ? "O persoană prezentă nu a semnat" : `${unsigned} persoane prezente nu au semnat`}. Confirmați închiderea.`);
      await tx.meeting.update({ where: { id: meetingId }, data: { locked: true, lockedAt: new Date() } });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: { ...before.view, inchis: true },
        ...(unsigned ? { extra: { nesemnate: unsigned } } : {}),
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** Reopens a closed meeting (administrator only). */
export async function unlockMeetingAction(meetingId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, meetingId);
    await ctx.db.$transaction(async (tx) => {
      const before = await signatureView(tx, meetingId);
      if (!before.meeting.locked) return;
      await tx.meeting.update({ where: { id: meetingId }, data: { locked: false, lockedAt: null } });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: before.label,
        action: "UPDATE",
        fields: SIGNATURE_FIELDS,
        before: before.view,
        after: { ...before.view, inchis: false },
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}
