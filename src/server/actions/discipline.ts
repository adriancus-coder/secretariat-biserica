"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { DISCIPLINARY_FORM_LABEL } from "@/lib/labels";
import { closingErrors, DISCIPLINE_FIELDS, disciplineSchema, reinstateSchema } from "@/lib/schemas/discipline";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { disciplineView } from "../discipline";
import { syncRoleGroups } from "../group-sync";
import { getChurch } from "../queries/church";
import { actionCtx, ActionError } from "../session";
import { hasStepUp, STEP_UP_REQUIRED } from "../step-up";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/**
 * Adds (measureId = null) or edits a disciplinary measure. Administrators only (`disciplina`). An
 * applied exclusion also records the exit on the person (Statut art. 27 alin. 5, 10): exit date =
 * the measure's date, mode Excludere, the minutes, statut Fost membru.
 */
export async function saveDisciplineAction(personId: string, measureId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let saved = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("disciplina");
    if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
    parseOrThrow(idSchema, personId);
    if (measureId !== null) parseOrThrow(idSchema, measureId);
    const input = parseOrThrow(disciplineSchema, Object.fromEntries(formData));
    const meeting = input.meetingId ? await ctx.db.meeting.findUnique({ where: { id: input.meetingId }, select: { id: true, tip: true } }) : null;
    if (input.meetingId && !meeting) throw new ValidationError({ meetingId: "Procesul-verbal ales nu mai există." });
    const church = await getChurch(ctx);
    await ctx.db.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId } });
      if (!person) throw new ActionError("Persoana nu mai există în registru.");
      // Closing an investigation (art. 272 lit. c): committee minutes and the mandatory contents.
      const previous = measureId ? await tx.disciplinaryMeasure.findFirst({ where: { id: measureId, personId }, select: { stare: true } }) : null;
      if (previous?.stare === "CERCETARE" && input.stare !== "CERCETARE") {
        const errors = closingErrors(input);
        if (meeting && church.attendanceRules[meeting.tip] !== "COMITET") errors.meetingId = "Alegeți procesul-verbal al unei ședințe de comitet (Statut art. 272).";
        if (Object.keys(errors).length) throw new ValidationError(errors);
      }
      const data = {
        forma: input.forma,
        stare: input.stare,
        dataInceput: toDbDate(input.dataInceput)!,
        dataSfarsit: toDbDate(input.dataSfarsit),
        meetingId: input.meetingId,
        motiv: input.motiv,
        decisByForum: input.decisByForum,
        audiereLa: toDbDate(input.audiereLa),
        audiereOra: input.audiereOra,
        audiereLoc: input.audiereLoc,
        abatere: input.abatere,
        raspuns: input.raspuns,
        nuSaPrezentat: input.nuSaPrezentat,
        incadrare: input.incadrare,
        temei: input.temei,
        comunicatLa: toDbDate(input.comunicatLa),
        contestatieLa: toDbDate(input.contestatieLa),
        contestatieRezultat: input.contestatieRezultat,
      };
      let id = measureId;
      const before = id ? await disciplineView(tx, id) : null;
      if (id) {
        const { count } = await tx.disciplinaryMeasure.updateMany({ where: { id, personId }, data });
        if (!count) throw new ActionError("Măsura nu mai există.");
      } else {
        id = (await tx.disciplinaryMeasure.create({ data: { ...data, personId, churchId: ctx.user.churchId, createdById: ctx.user.id } })).id;
      }
      await writeAudit(tx, ctx.user, {
        entity: "DISCIPLINE",
        entityId: id,
        entityLabel: `${memberName(person)} — ${DISCIPLINARY_FORM_LABEL[input.forma]}`,
        action: measureId ? "UPDATE" : "CREATE",
        fields: DISCIPLINE_FIELDS,
        before,
        after: await disciplineView(tx, id),
      });
      if (input.forma === "EXCLUDERE" && input.stare === "APLICATA" && (person.modIesire !== "EXCLUDERE" || !person.dataIesire)) {
        const after = await tx.person.update({
          where: { id: personId },
          data: { dataIesire: toDbDate(input.dataInceput), modIesire: "EXCLUDERE", iesireMeetingId: input.meetingId, statut: "FOST_MEMBRU" },
        });
        const roles = await tx.personRole.findMany({ where: { personId }, select: { roleId: true } });
        await syncRoleGroups(tx, ctx.user, { roleIds: roles.map((r) => r.roleId) });
        await writeAudit(tx, ctx.user, {
          entity: "PERSON",
          entityId: personId,
          entityLabel: memberName(after),
          action: "UPDATE",
          fields: PERSON_FIELDS,
          before: person,
          after,
        });
      }
    });
    saved = true;
  });
  if (!saved) return state;
  revalidatePath("/", "layout");
  redirect(`/persoane/${personId}/disciplina?salvat=1`);
}

/** Deletes a measure entered by mistake (administrators only, audited). */
export async function deleteDisciplineAction(personId: string, measureId: string): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("disciplina");
    if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
    parseOrThrow(idSchema, personId);
    parseOrThrow(idSchema, measureId);
    await ctx.db.$transaction(async (tx) => {
      const before = await disciplineView(tx, measureId);
      const person = await tx.person.findUnique({ where: { id: personId }, select: { nume: true, prenume: true } });
      const { count } = await tx.disciplinaryMeasure.deleteMany({ where: { id: measureId, personId } });
      if (!count || !before || !person) throw new ActionError("Măsura nu mai există.");
      await writeAudit(tx, ctx.user, {
        entity: "DISCIPLINE",
        entityId: measureId,
        entityLabel: `${memberName(person)} — ${before.forma}`,
        action: "DELETE",
        fields: DISCIPLINE_FIELDS,
        before,
      });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath("/", "layout");
  redirect(`/persoane/${personId}/disciplina?sters=1`);
}

/** A suspended committee member: "Scoate din comitet" in one click (Statut art. 27; audited on the person). */
export async function removeFromCommitteeAction(personId: string): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("disciplina");
    if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
    parseOrThrow(idSchema, personId);
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.person.findUnique({ where: { id: personId } });
      if (!before) throw new ActionError("Persoana nu mai există în registru.");
      const after = await tx.person.update({ where: { id: personId }, data: { inComitet: false } });
      await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: personId, entityLabel: memberName(after), action: "UPDATE", fields: PERSON_FIELDS, before, after });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath("/", "layout");
  redirect(`/persoane/${personId}/disciplina?salvat=1`);
}

/**
 * "Repunere în drepturi / reprimire" (Statut art. 271) on an applied suspension, withdrawal of rights or
 * exclusion: needs the written request's date (alin. 1 lit. e) and the committee minutes (alin. 2). It
 * closes the measure; after an exclusion the person is a member again, entered by "Reabilitare
 * spirituală" (REPRIMIRE) on the minutes' date. Administrators only, audited.
 */
export async function reinstateAction(personId: string, measureId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let saved = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("disciplina");
    if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
    parseOrThrow(idSchema, personId);
    parseOrThrow(idSchema, measureId);
    const input = parseOrThrow(reinstateSchema, Object.fromEntries(formData));
    const meeting = await ctx.db.meeting.findUnique({ where: { id: input.meetingId! }, select: { id: true, data: true } });
    if (!meeting) throw new ValidationError({ meetingId: "Procesul-verbal ales nu mai există." });
    await ctx.db.$transaction(async (tx) => {
      const m = await tx.disciplinaryMeasure.findFirst({ where: { id: measureId, personId } });
      const person = await tx.person.findUnique({ where: { id: personId } });
      if (!m || !person) throw new ActionError("Măsura nu mai există.");
      if (m.stare !== "APLICATA" || !["SUSPENDARE", "RETRAGERE_DREPTURI", "EXCLUDERE"].includes(m.forma)) {
        throw new ActionError("Repunerea în drepturi se aplică unei suspendări, retrageri de drepturi sau excluderi aplicate (Statut art. 271).");
      }
      const before = await disciplineView(tx, measureId);
      await tx.disciplinaryMeasure.update({
        where: { id: measureId },
        data: { stare: "INCHEIATA", dataSfarsit: meeting.data, cerereRepunereLa: toDbDate(input.cerereLa), repunereMeetingId: meeting.id },
      });
      await writeAudit(tx, ctx.user, {
        entity: "DISCIPLINE",
        entityId: measureId,
        entityLabel: `${memberName(person)} — ${DISCIPLINARY_FORM_LABEL[m.forma]}`,
        action: "UPDATE",
        fields: DISCIPLINE_FIELDS,
        before,
        after: await disciplineView(tx, measureId),
      });
      if (m.forma === "EXCLUDERE") {
        const after = await tx.person.update({
          where: { id: personId },
          data: {
            statut: "MEMBRU",
            dataIesire: null,
            modIesire: null,
            iesireMeetingId: null,
            modIntrare: "REPRIMIRE",
            dataMembru: meeting.data,
            intrareMeetingId: meeting.id,
          },
        });
        const roles = await tx.personRole.findMany({ where: { personId }, select: { roleId: true } });
        await syncRoleGroups(tx, ctx.user, { roleIds: roles.map((r) => r.roleId) });
        await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: personId, entityLabel: memberName(after), action: "UPDATE", fields: PERSON_FIELDS, before: person, after });
      }
    });
    saved = true;
  });
  if (!saved) return state;
  revalidatePath("/", "layout");
  redirect(`/persoane/${personId}/disciplina?salvat=1`);
}
