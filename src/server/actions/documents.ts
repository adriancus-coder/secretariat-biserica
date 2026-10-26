"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { DOCUMENT_STATE_LABEL, DOCUMENT_TYPE_LABEL, type DocumentStateKey } from "@/lib/labels";
import { richFormatSummary } from "@/lib/rich-text";
import { DOCUMENT_FIELDS, documentSchema, draftSchema } from "@/lib/schemas/document";
import { storedRich } from "@/lib/schemas/rich-text";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { registerDocumentReply } from "../correspondence";
import { lockDocumentRegister, nextFreeNumber } from "../doc-numbering";
import { buildDocumentDraft } from "../queries/documents";
import { recommendationDiscipline } from "../discipline";
import { permissions } from "@/lib/permissions";
import { hasActivePastor } from "../pastor-approval";
import { actionCtx, ActionError, type Ctx } from "../session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];
import { isUniqueViolation, parseOrThrow, runFormAction, ValidationError } from "./run";
import { logError } from "../log";

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
  evolutie?: boolean;
  exceptieDomiciliu?: boolean;
  sedintaId?: string;
}): Promise<{ text: string; titlu: string } | { error: string }> {
  try {
    const ctx = await actionCtx("write");
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) return { error: "Completați tipul și data documentului." };
    return await buildDocumentDraft(ctx, parsed.data);
  } catch (e) {
    if (e instanceof ActionError) return { error: e.message };
    logError("documentDraft", e);
    return { error: "Textul nu a putut fi generat." };
  }
}

/** The document for the audit log: its fields plus the formatting the rich text uses ("Formatare"). */
function auditView<T extends { textRich: unknown }>(d: T | null): (T & { formatare: string }) | null {
  return d ? { ...d, formatare: richFormatSummary(storedRich(d.textRich)) } : null;
}

export async function saveDocumentAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(documentSchema, Object.fromEntries(formData));
    const rawReply = formData.get("raspunsLa");
    const replyTo = id === null && typeof rawReply === "string" && idSchema.safeParse(rawReply).success ? rawReply : null;
    const anRegistru = Number(input.data.slice(0, 4));
    const person = input.personId
      ? await ctx.db.person.findUnique({ where: { id: input.personId }, select: { id: true, nume: true, prenume: true } })
      : null;
    if (input.personId && !person) throw new ValidationError({ personId: "Persoana nu mai există în registru." });
    // Statut art. 27 alin. 6 and 9: a recommendation for a person with an open measure.
    const exceptieDomiciliu = input.tip === "recomandare" && input.exceptieDomiciliu && permissions.disciplina(ctx.user);
    if (input.tip === "recomandare" && person) await recommendationDiscipline(ctx, person.id, exceptieDomiciliu);

    const fields = {
      tip: input.tip,
      data: toDbDate(input.data)!,
      anRegistru,
      personId: person?.id ?? null,
      catre: input.catre,
      scop: input.scop,
      titlu: input.titlu,
      text: input.text,
      textRich: input.textRich ? (input.textRich as unknown as Prisma.InputJsonObject) : Prisma.DbNull,
      anRaport: input.tip === "raport" ? (input.anRaport ?? anRegistru) : null,
      exceptieDomiciliu,
    };

    // Without an active pastor in the app documents are issued directly (no approval step).
    const approval = await hasActivePastor(ctx.user.churchId);
    try {
      savedId = await ctx.db.$transaction(async (tx) => {
        // Serializează alocarea numerelor pe (biserică, an): două salvări simultane nu pot primi același număr.
        await lockDocumentRegister(tx, ctx.user.churchId, anRegistru);
        const nr = input.nr ?? (await nextFreeNumber(tx, ctx.user.churchId, anRegistru));
        if (id) {
          const before = auditView(await tx.document.findUnique({ where: { id } }));
          if (!before) throw new ActionError("Documentul nu mai există în registru.");
          // Numele persoanei rămâne cel de la emitere, dacă persoana nu s-a schimbat.
          const persoana = person ? (person.id === before.personId && before.persoana ? before.persoana : memberName(person)) : "";
          const after = auditView(await tx.document.update({ where: { id }, data: { ...fields, nr, persoana } }))!;
          // A changed document goes back to a draft: its signatures (and an approval) no longer apply.
          const changed = DOCUMENT_FIELDS.some((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
          if (changed) await resetApproval(tx, ctx, { id, label: label(after), stare: before.stare }, approval);
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
          data: { ...fields, nr, persoana: person ? memberName(person) : "", stare: approval ? "CIORNA" : "APROBAT", churchId: ctx.user.churchId },
        });
        await writeAudit(tx, ctx.user, {
          entity: "DOCUMENT",
          entityId: created.id,
          entityLabel: label(created),
          action: "CREATE",
          fields: DOCUMENT_FIELDS,
          after: auditView(created),
        });
        // CORRESPONDENCE-REGISTER: written as the answer to an entry of the register ("Răspunde").
        if (replyTo) {
          await registerDocumentReply(tx, ctx.user, replyTo, {
            id: created.id,
            nr: created.nr,
            anRegistru: created.anRegistru,
            data: input.data,
            catre: created.catre || created.persoana,
            subiect: created.titlu || DOCUMENT_TYPE_LABEL[created.tip],
            personId: created.personId,
          });
        }
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

/**
 * Back to CIORNA after an edit: an approved (or pending) document loses its approval and both
 * signatures; audited with the old state and the removed signatures (names only). Without the
 * approval step (no pastor in the app) only the signatures are removed.
 */
async function resetApproval(tx: Tx, ctx: Ctx, doc: { id: string; label: string; stare: DocumentStateKey }, approval: boolean) {
  const sigs = await tx.documentSignature.findMany({ where: { documentId: doc.id }, select: { role: true, name: true } });
  const toDraft = approval && doc.stare !== "CIORNA";
  if (!toDraft && !sigs.length) return;
  await tx.documentSignature.deleteMany({ where: { documentId: doc.id } });
  if (toDraft) await tx.document.update({ where: { id: doc.id }, data: { stare: "CIORNA", trimisLaSemnatLa: null, aprobatDeUserId: null, aprobatLa: null } });
  const signed = sigs.map((s) => `${s.role === "PASTOR" ? "pastor" : "secretar"}: ${s.name}`).join(", ");
  await writeAudit(tx, ctx.user, {
    entity: "DOCUMENT",
    entityId: doc.id,
    entityLabel: doc.label,
    action: "UPDATE",
    fields: toDraft ? ["stare", "semnaturi"] : ["semnaturi"],
    before: { stare: DOCUMENT_STATE_LABEL[doc.stare], semnaturi: signed },
    after: { stare: DOCUMENT_STATE_LABEL.CIORNA, semnaturi: "" },
  });
}

export async function deleteDocumentAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = auditView(await tx.document.findUnique({ where: { id } }));
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
