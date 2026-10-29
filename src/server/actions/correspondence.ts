"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { toDbDate } from "@/lib/dates";
import { CORRESPONDENCE_FIELDS, correspondenceSchema } from "@/lib/schemas/correspondence";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { correspondenceLabel as label, correspondenceView as view, markAnswered } from "../correspondence";
import { lockCorrespondenceRegister, nextFreeCorrespondenceNumber } from "../doc-numbering";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";
import { visibleDocument } from "../confidential-documents";

/**
 * "+ Înregistrează intrare / ieșire", "Răspunde", editing (write roles). The number is the next free one
 * of the year (one sequence for entries and exits), or the one typed, if free. Linked ids are checked
 * against the church; an exit answering an entry whose resolution is empty or „În lucru” marks it
 * „Răspuns cu nr. N/an”. Audited (CORRESPONDENCE).
 */
export async function saveCorrespondenceAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(correspondenceSchema, Object.fromEntries(formData));
    const an = Number(input.data.slice(0, 4));
    if (input.personId && !(await ctx.db.person.findUnique({ where: { id: input.personId }, select: { id: true } }))) throw new ValidationError({ personId: "Persoana nu mai există în registru." });
    if (input.documentId && !visibleDocument(ctx.user, await ctx.db.document.findUnique({ where: { id: input.documentId }, select: { id: true, confidential: true } }))) throw new ValidationError({ documentId: "Documentul nu mai există." });
    const answered = input.raspunsLaId ? await ctx.db.correspondence.findUnique({ where: { id: input.raspunsLaId }, select: { id: true, directie: true, rezolvare: true, nr: true, an: true } }) : null;
    if (input.raspunsLaId && (!answered || answered.directie !== "INTRARE" || answered.id === id)) throw new ValidationError({ raspunsLaId: "Intrarea la care se răspunde nu există." });
    if (input.directie === "INTRARE" && (input.raspunsLaId || input.documentId)) throw new ValidationError({ directie: "Doar o ieșire răspunde la o intrare sau este un document emis." });
    const data = {
      data: toDbDate(input.data)!,
      directie: input.directie,
      dela: input.directie === "INTRARE" ? input.dela : "",
      catre: input.directie === "IESIRE" ? input.catre : "",
      subiect: input.subiect,
      rezolvare: input.rezolvare,
      documentId: input.documentId,
      raspunsLaId: input.raspunsLaId,
      personId: input.personId,
    };
    savedId = await ctx.db.$transaction(async (tx) => {
      const before = id ? await view(tx, id) : null;
      if (id && !before) throw new ActionError("Înregistrarea nu mai există.");
      const current = id ? await tx.correspondence.findUnique({ where: { id }, select: { nr: true, an: true } }) : null;
      await lockCorrespondenceRegister(tx, ctx.user.churchId, an);
      let nr = input.nr ?? (current && current.an === an ? current.nr : null);
      if (nr === null) nr = await nextFreeCorrespondenceNumber(tx, ctx.user.churchId, an);
      else {
        const taken = await tx.correspondence.findFirst({ where: { an, nr, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
        if (taken) throw new ValidationError({ nr: `Numărul ${nr}/${an} este deja folosit în registru.` });
      }
      const row = id
        ? await tx.correspondence.update({ where: { id }, data: { ...data, nr, an } })
        : await tx.correspondence.create({ data: { ...data, nr, an, churchId: ctx.user.churchId, createdById: ctx.user.id } });
      if (answered) await markAnswered(tx, ctx.user, answered, `Răspuns cu nr. ${nr}/${an}`);
      const after = await view(tx, row.id);
      await writeAudit(tx, ctx.user, { entity: "CORRESPONDENCE", entityId: row.id, entityLabel: label(after!), action: id ? "UPDATE" : "CREATE", fields: CORRESPONDENCE_FIELDS, before, after });
      return row.id;
    });
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  redirect(`/corespondenta/${savedId}?salvat=1`);
}

/** Removing a row registered by mistake (write roles); its number stays a gap, as in a paper register. Audited. */
export async function deleteCorrespondenceAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await view(tx, id);
      if (!before) throw new ActionError("Înregistrarea nu mai există.");
      await tx.correspondence.delete({ where: { id } });
      await writeAudit(tx, ctx.user, { entity: "CORRESPONDENCE", entityId: id, entityLabel: label(before), action: "DELETE", fields: CORRESPONDENCE_FIELDS, before });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/corespondenta?sters=1");
}
