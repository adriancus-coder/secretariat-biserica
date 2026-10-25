"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { toDbDate } from "@/lib/dates";
import type { FormState, PersonFormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { personDerived } from "@/lib/person-derived";
import { applyExitRule, PERSON_FIELDS, personSchema, type PersonInput } from "@/lib/schemas/person";
import { APPLICATION_FIELDS } from "@/lib/schemas/application";
import { personRolesSchema } from "@/lib/schemas/roles";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { assertPersonRoles, personRolesAudit, writePersonRoles } from "../person-roles";
import { findDuplicatePerson } from "../queries/applications";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/** Fields tracked by the audit log: the person's columns plus the roles held (as names). */
const PERSON_AUDIT_FIELDS = [...PERSON_FIELDS, "functii"] as const;

function toPersonData(input: PersonInput) {
  return {
    ...input,
    dataNasterii: toDbDate(input.dataNasterii),
    dataMembru: toDbDate(input.dataMembru),
    dataBotez: toDbDate(input.dataBotez),
    dataBinecuvantare: toDbDate(input.dataBinecuvantare),
    dataIesire: toDbDate(input.dataIesire),
    ...personDerived(input),
  } satisfies Prisma.PersonUpdateInput;
}

/**
 * Adăugarea (id = null) sau modificarea unei persoane.
 * With a hidden `cerere` field (accepting a membership application), the new person and the
 * ACCEPTED application are written in one transaction; a person with the same name and birth date
 * stops the save with a warning unless `fortat=1` ("Creează oricum").
 */
export async function savePersonAction(id: string | null, _prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  let savedId: string | undefined;
  let duplicate: PersonFormState["duplicate"];
  const applicationId = id === null ? String(formData.get("cerere") ?? "") : "";
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    if (applicationId) parseOrThrow(idSchema, applicationId);
    const input = applyExitRule(parseOrThrow(personSchema, Object.fromEntries(formData)));
    const data = toPersonData(input);
    const roles = parseOrThrow(personRolesSchema, formData.get("functii"));
    await assertPersonRoles(ctx.db, id, roles);

    if (applicationId) {
      const app = await ctx.db.application.findUnique({ where: { id: applicationId }, select: { status: true } });
      if (!app) throw new ActionError("Cererea nu mai există.");
      if (app.status !== "PENDING") throw new ActionError("Cererea a fost deja procesată.");
      if (formData.get("fortat") !== "1") {
        const dup = await findDuplicatePerson(ctx.db, { nume: input.nume, prenume: input.prenume, dataNasterii: data.dataNasterii });
        if (dup) {
          duplicate = { id: dup.id, name: memberName(dup) };
          return { message: "Există deja în registru o persoană cu același nume și aceeași dată de naștere." };
        }
      }
    }

    savedId = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.person.findUnique({ where: { id } });
        if (!before) throw new ActionError("Persoana nu mai există în registru.");
        const rolesBefore = await personRolesAudit(tx, id);
        const after = await tx.person.update({ where: { id }, data });
        await writePersonRoles(tx, id, roles);
        await writeAudit(tx, ctx.user, {
          entity: "PERSON",
          entityId: id,
          entityLabel: memberName(after),
          action: "UPDATE",
          fields: PERSON_AUDIT_FIELDS,
          before: { ...before, functii: rolesBefore },
          after: { ...after, functii: await personRolesAudit(tx, id) },
        });
        return id;
      }
      const created = await tx.person.create({ data: { ...data, churchId: ctx.user.churchId } });
      await writePersonRoles(tx, created.id, roles);
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: created.id,
        entityLabel: memberName(created),
        action: "CREATE",
        fields: PERSON_AUDIT_FIELDS,
        after: { ...created, functii: await personRolesAudit(tx, created.id) },
        ...(applicationId ? { extra: { sursa: "cerere de membru" } } : {}),
      });
      if (applicationId) {
        const accepted = await tx.application.updateMany({
          where: { id: applicationId, status: "PENDING" },
          data: { status: "ACCEPTED", personId: created.id, decidedAt: new Date(), decidedById: ctx.user.id },
        });
        if (accepted.count !== 1) throw new ActionError("Cererea a fost deja procesată.");
        const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
        await writeAudit(tx, ctx.user, {
          entity: "APPLICATION",
          entityId: applicationId,
          entityLabel: memberName(app),
          action: "UPDATE",
          fields: [...APPLICATION_FIELDS, "persoana"],
          before: { stare: "PENDING" },
          after: { stare: "ACCEPTED", persoana: memberName(created) },
        });
      }
      return created.id;
    });
  });
  if (!savedId) return duplicate ? { ...state, ok: false, duplicate } : state;
  revalidatePath("/", "layout");
  redirect(`/persoane/${savedId}?salvat=1`);
}

export async function deletePersonAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.person.findUnique({ where: { id } });
      if (!before) throw new ActionError("Persoana nu mai există în registru.");
      const functii = await personRolesAudit(tx, id);
      await tx.person.delete({ where: { id } });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: id,
        entityLabel: memberName(before),
        action: "DELETE",
        fields: PERSON_AUDIT_FIELDS,
        before: { ...before, functii },
      });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/persoane?sters=1");
}
