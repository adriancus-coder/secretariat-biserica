"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { DISCIPLINARY_FORM_LABEL } from "@/lib/labels";
import { DISCIPLINE_FIELDS, disciplineSchema } from "@/lib/schemas/discipline";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { disciplineView } from "../discipline";
import { syncRoleGroups } from "../group-sync";
import { actionCtx, ActionError } from "../session";
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
    parseOrThrow(idSchema, personId);
    if (measureId !== null) parseOrThrow(idSchema, measureId);
    const input = parseOrThrow(disciplineSchema, Object.fromEntries(formData));
    if (input.meetingId && !(await ctx.db.meeting.findUnique({ where: { id: input.meetingId }, select: { id: true } }))) {
      throw new ValidationError({ meetingId: "Procesul-verbal ales nu mai există." });
    }
    await ctx.db.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId } });
      if (!person) throw new ActionError("Persoana nu mai există în registru.");
      const data = {
        forma: input.forma,
        stare: input.stare,
        dataInceput: toDbDate(input.dataInceput)!,
        dataSfarsit: toDbDate(input.dataSfarsit),
        meetingId: input.meetingId,
        motiv: input.motiv,
        decisByForum: input.decisByForum,
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
