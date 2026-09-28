"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { DOCUMENT_FIELDS, documentSchema, draftSchema } from "@/lib/schemas/document";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { lockDocumentRegister, nextFreeNumber } from "../doc-numbering";
import { buildDocumentDraft } from "../queries/documents";
import { actionCtx, ActionError } from "../session";
import { isUniqueViolation, parseOrThrow, runFormAction, ValidationError } from "./run";

const label = (d: { nr: number; anRegistru: number; titlu: string; tip: keyof typeof DOCUMENT_TYPE_LABEL }) =>
  `Nr. ${d.nr}/${d.anRegistru} — ${d.titlu || DOCUMENT_TYPE_LABEL[d.tip]}`;

/** Generarea textului din șablon, apelată din formular la schimbarea tipului, persoanei etc. */
export async function documentDraftAction(input: {
  tip: string;
  personId: string;
  catre: string;
  scop: string;
  anRaport: string;
  data: string;
}): Promise<{ text: string; titlu: string } | { error: string }> {
  try {
    const ctx = await actionCtx("write");
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) return { error: "Completați tipul și data documentului." };
    return await buildDocumentDraft(ctx, parsed.data);
  } catch (e) {
    if (e instanceof ActionError) return { error: e.message };
    console.error("[documentDraft]", e);
    return { error: "Textul nu a putut fi generat." };
  }
}

export async function saveDocumentAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(documentSchema, Object.fromEntries(formData));
    const anRegistru = Number(input.data.slice(0, 4));
    const person = input.personId
      ? await ctx.db.person.findUnique({ where: { id: input.personId }, select: { id: true, nume: true, prenume: true } })
      : null;
    if (input.personId && !person) throw new ValidationError({ personId: "Persoana nu mai există în registru." });

    const fields = {
      tip: input.tip,
      data: toDbDate(input.data)!,
      anRegistru,
      personId: person?.id ?? null,
      catre: input.catre,
      scop: input.scop,
      titlu: input.titlu,
      text: input.text,
      anRaport: input.tip === "raport" ? (input.anRaport ?? anRegistru) : null,
    };

    try {
      savedId = await ctx.db.$transaction(async (tx) => {
        // Serializează alocarea numerelor pe (biserică, an): două salvări simultane nu pot primi același număr.
        await lockDocumentRegister(tx, ctx.user.churchId, anRegistru);
        const nr = input.nr ?? (await nextFreeNumber(tx, ctx.user.churchId, anRegistru));
        if (id) {
          const before = await tx.document.findUnique({ where: { id } });
          if (!before) throw new ActionError("Documentul nu mai există în registru.");
          // Numele persoanei rămâne cel de la emitere, dacă persoana nu s-a schimbat.
          const persoana = person ? (person.id === before.personId && before.persoana ? before.persoana : memberName(person)) : "";
          const after = await tx.document.update({ where: { id }, data: { ...fields, nr, persoana } });
          await writeAudit(tx, ctx.user, {
            entity: "DOCUMENT",
            entityId: id,
            entityLabel: label(after),
            action: "UPDATE",
            fields: DOCUMENT_FIELDS,
            before,
            after,
          });
          return id;
        }
        const created = await tx.document.create({
          data: { ...fields, nr, persoana: person ? memberName(person) : "", churchId: ctx.user.churchId },
        });
        await writeAudit(tx, ctx.user, {
          entity: "DOCUMENT",
          entityId: created.id,
          entityLabel: label(created),
          action: "CREATE",
          fields: DOCUMENT_FIELDS,
          after: created,
        });
        return created.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ValidationError({ nr: `Numărul ${input.nr}/${anRegistru} este deja folosit în registru.` });
      }
      throw e;
    }
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  redirect(`/documente/${savedId}?inregistrat=1`);
}

export async function deleteDocumentAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.document.findUnique({ where: { id } });
      if (!before) throw new ActionError("Documentul nu mai există în registru.");
      await tx.document.delete({ where: { id } });
      await writeAudit(tx, ctx.user, {
        entity: "DOCUMENT",
        entityId: id,
        entityLabel: label(before),
        action: "DELETE",
        fields: DOCUMENT_FIELDS,
        before,
      });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/documente?sters=1");
}
