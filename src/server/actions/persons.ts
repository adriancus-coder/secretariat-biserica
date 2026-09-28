"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { personDerived } from "@/lib/person-derived";
import { applyExitRule, PERSON_FIELDS, personSchema, type PersonInput } from "@/lib/schemas/person";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

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

/** Adăugarea (id = null) sau modificarea unei persoane. */
export async function savePersonAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = applyExitRule(parseOrThrow(personSchema, Object.fromEntries(formData)));
    const data = toPersonData(input);

    savedId = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.person.findUnique({ where: { id } });
        if (!before) throw new ActionError("Persoana nu mai există în registru.");
        const after = await tx.person.update({ where: { id }, data });
        await writeAudit(tx, ctx.user, {
          entity: "PERSON",
          entityId: id,
          entityLabel: memberName(after),
          action: "UPDATE",
          fields: PERSON_FIELDS,
          before,
          after,
        });
        return id;
      }
      const created = await tx.person.create({ data: { ...data, churchId: ctx.user.churchId } });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: created.id,
        entityLabel: memberName(created),
        action: "CREATE",
        fields: PERSON_FIELDS,
        after: created,
      });
      return created.id;
    });
  });
  if (!savedId) return state;
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
      await tx.person.delete({ where: { id } });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: id,
        entityLabel: memberName(before),
        action: "DELETE",
        fields: PERSON_FIELDS,
        before,
      });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/persoane?sters=1");
}
