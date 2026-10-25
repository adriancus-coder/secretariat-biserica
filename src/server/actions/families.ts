"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NEW_FAMILY } from "@/lib/families";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { familySchema, moveTargetSchema } from "@/lib/schemas/family";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { createFamilyFor, FAMILY_FIELDS, familyView, settleFamily } from "../families";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/** Renames a family, edits its address and notes, and changes its head (one of its members). */
export async function saveFamilyAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let saved = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    const input = parseOrThrow(familySchema, Object.fromEntries(formData));
    await ctx.db.$transaction(async (tx) => {
      const before = await familyView(tx, id);
      if (!before) throw new ActionError("Familia nu mai există.");
      const head = await tx.person.findUnique({ where: { id: input.headId }, select: { familyId: true } });
      if (head?.familyId !== id) throw new ValidationError({ headId: "Capul familiei trebuie să fie unul dintre membrii ei." });
      await tx.family.update({ where: { id }, data: input });
      await writeAudit(tx, ctx.user, {
        entity: "FAMILY",
        entityId: id,
        entityLabel: input.nume,
        action: "UPDATE",
        fields: FAMILY_FIELDS,
        before,
        after: await familyView(tx, id),
      });
    });
    saved = true;
  });
  if (!saved) return state;
  revalidatePath("/", "layout");
  redirect(`/familii/${id}?salvat=1`);
}

/**
 * "Mută persoana în altă familie": into an existing family or a new one headed by the person.
 * The head of a family with other members moves only after another head is chosen.
 */
export async function moveToFamilyAction(personId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let destination: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    const { tinta } = parseOrThrow(moveTargetSchema, Object.fromEntries(formData));
    destination = await ctx.db.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId }, include: { headOf: { select: { id: true, nume: true } }, family: { select: { nume: true } } } });
      if (!person) throw new ActionError("Persoana nu mai există în registru.");
      if (tinta === person.familyId) return tinta;
      if (tinta !== NEW_FAMILY && !(await tx.family.findUnique({ where: { id: tinta }, select: { id: true } }))) {
        throw new ValidationError({ tinta: "Familia aleasă nu mai există." });
      }
      if (person.headOf && (await tx.person.count({ where: { familyId: person.headOf.id, id: { not: personId } } }))) {
        throw new ActionError(`${memberName(person)} este capul familiei. Alegeți mai întâi alt cap al familiei, apoi mutați persoana.`);
      }
      const from = person.familyId;
      await tx.person.update({ where: { id: personId }, data: { familyId: tinta === NEW_FAMILY ? null : tinta } });
      if (from) await settleFamily(tx, ctx.user, from);
      const to = tinta === NEW_FAMILY ? await createFamilyFor(tx, ctx.user, person) : tinta;
      if (tinta !== NEW_FAMILY) await settleFamily(tx, ctx.user, to);
      const toName = (await tx.family.findUnique({ where: { id: to }, select: { nume: true } }))?.nume ?? "";
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: personId,
        entityLabel: memberName(person),
        action: "UPDATE",
        fields: ["familie"],
        before: { familie: person.family?.nume ?? "" },
        after: { familie: toName },
      });
      return to;
    });
  });
  if (!destination) return state;
  revalidatePath("/", "layout");
  redirect(`/familii/${destination}?salvat=1&mesaj=${encodeURIComponent("Persoana a fost mutată.")}`);
}
