"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mandateEnd } from "@/lib/committee";
import { fromDbDate, toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { compareRo } from "@/lib/text";
import { idSchema, optionalDate, optionalId } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const MANDATE_FIELDS = ["comitetAlesLa", "comitetAlegere", "comitetPrelungit", "comitetExpira"] as const;

const mandateSchema = z.object({ alesLa: optionalDate, sedinta: optionalId });

/** The mandate for the audit log: dates and the election's minutes by name. */
async function mandateView(tx: Tx, c: { comitetAlesLa: Date | null; comitetAlegereMeetingId: string | null; comitetPrelungit: boolean }) {
  const m = c.comitetAlegereMeetingId
    ? await tx.meeting.findUnique({ where: { id: c.comitetAlegereMeetingId }, select: { nr: true, anRegistru: true, tip: true, data: true } })
    : null;
  const alesLa = fromDbDate(c.comitetAlesLa);
  return {
    comitetAlesLa: alesLa ?? "",
    comitetAlegere: m ? `${m.nr != null ? `PV nr. ${m.nr}/${m.anRegistru} — ` : ""}${m.tip} (${fromDbDate(m.data)})` : "",
    comitetPrelungit: c.comitetPrelungit ? "da" : "nu",
    comitetExpira: alesLa ? mandateEnd(alesLa, c.comitetPrelungit) : "",
  };
}

/** Setări → Mandatul comitetului: the election date and its minutes (administrators; Statut art. 45). */
export async function saveCommitteeMandateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    const input = parseOrThrow(mandateSchema, Object.fromEntries(formData));
    await ctx.db.$transaction(async (tx) => {
      // The minutes must be the church's own (the church row itself is not a tenant model).
      if (input.sedinta && !(await tx.meeting.findUnique({ where: { id: input.sedinta }, select: { id: true } })))
        throw new ValidationError({ sedinta: "Procesul-verbal ales nu există." });
      const before = await tx.church.findUniqueOrThrow({ where: { id: ctx.user.churchId } });
      // A new election starts a new mandate: the extension no longer applies.
      const newElection = fromDbDate(before.comitetAlesLa) !== input.alesLa;
      const after = await tx.church.update({
        where: { id: ctx.user.churchId },
        data: { comitetAlesLa: toDbDate(input.alesLa), comitetAlegereMeetingId: input.sedinta, ...(newElection ? { comitetPrelungit: false } : {}) },
      });
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: after.nume,
        action: "UPDATE",
        fields: MANDATE_FIELDS,
        before: await mandateView(tx, before),
        after: await mandateView(tx, after),
      });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Mandatul comitetului a fost salvat." };
  });
}

/** "Prelungește mandatul cu 5 ani": once only (Statut art. 45); a second extension is refused. */
export async function extendCommitteeMandateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.church.findUniqueOrThrow({ where: { id: ctx.user.churchId } });
      if (!before.comitetAlesLa) throw new ActionError("Completați întâi data alegerii comitetului.");
      if (before.comitetPrelungit) throw new ActionError("Mandatul a fost deja prelungit o dată; Statutul (art. 45) nu permite o a doua prelungire. Este nevoie de alegeri.");
      const after = await tx.church.update({ where: { id: ctx.user.churchId }, data: { comitetPrelungit: true } });
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: after.nume,
        action: "UPDATE",
        fields: MANDATE_FIELDS,
        before: await mandateView(tx, before),
        after: await mandateView(tx, after),
      });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Mandatul a fost prelungit cu 5 ani." };
  });
}

/** Excused absences of a meeting (`motivat:<personId>` checkboxes); audited on the meeting. */
export async function saveExcusedAction(meetingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let done = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, meetingId);
    await ctx.db.$transaction(async (tx) => {
      // Through the church-scoped meeting: the attendee rows have no churchId of their own.
      const m = await tx.meeting.findUnique({
        where: { id: meetingId },
        select: { locked: true, titlu: true, tip: true, data: true, prezenti: { where: { status: "ABSENT" }, select: { personId: true, motivat: true, person: { select: { nume: true, prenume: true } } } } },
      });
      if (!m) throw new ActionError("Procesul-verbal nu mai există.");
      if (m.locked) throw new ActionError("Procesul-verbal este închis. Doar administratorul îl poate redeschide.");
      const absent = m.prezenti;
      const wanted = new Set(absent.filter((p) => formData.get(`motivat:${p.personId}`) === "on").map((p) => p.personId));
      const text = (keep: (p: (typeof absent)[number]) => boolean) => absent.filter(keep).map((p) => memberName(p.person)).sort(compareRo).join(", ");
      const before = text((p) => p.motivat);
      await tx.meetingAttendee.updateMany({ where: { meetingId, status: "ABSENT" }, data: { motivat: false } });
      if (wanted.size) await tx.meetingAttendee.updateMany({ where: { meetingId, status: "ABSENT", personId: { in: [...wanted] } }, data: { motivat: true } });
      const after = text((p) => wanted.has(p.personId));
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: meetingId,
        entityLabel: `${m.titlu || m.tip} (${fromDbDate(m.data)})`,
        action: "UPDATE",
        fields: ["motivati"],
        before: { motivati: before },
        after: { motivati: after },
      });
    });
    done = true;
  });
  if (!done) return state;
  revalidatePath("/", "layout");
  redirect(`/procese-verbale/${meetingId}?salvat=1&mesaj=${encodeURIComponent("Absențele motivate au fost salvate.")}`);
}
