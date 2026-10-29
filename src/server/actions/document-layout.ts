"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/lib/form-state";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { layoutSummary, pageLayoutInput, pageLayoutSchema, storedLayout } from "@/lib/page-layout";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { getChurch } from "../queries/church";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";
import { visibleDocument } from "../confidential-documents";

/**
 * "Așezare în pagină" of a registered document, like the minutes'. The button pressed (`scop`):
 * - "pv": this document's own layout (write);
 * - "implicit": the church's default for every document without its own (admin);
 * - "resetare": this document goes back to the church's default.
 */
export async function saveDocumentLayoutAction(documentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const scop = String(formData.get("scop") ?? "pv");
    const ctx = await actionCtx(scop === "implicit" ? "admin" : "write");
    parseOrThrow(idSchema, documentId);
    const doc = visibleDocument(ctx.user, await ctx.db.document.findUnique({ where: { id: documentId }, select: { id: true, nr: true, anRegistru: true, tip: true, titlu: true, layout: true, confidential: true } }));
    if (!doc) throw new ActionError("Documentul nu mai există în registru.");
    const church = await getChurch(ctx);
    const label = `Nr. ${doc.nr}/${doc.anRegistru} — ${doc.titlu || DOCUMENT_TYPE_LABEL[doc.tip]}`;

    if (scop === "implicit") {
      const layout = parseOrThrow(pageLayoutSchema, pageLayoutInput(formData));
      await prisma.$transaction(async (tx) => {
        // Church is not a tenant model: the id comes from the session.
        await tx.church.update({ where: { id: ctx.user.churchId }, data: { docLayout: layout } });
        await writeAudit(tx, ctx.user, {
          entity: "SETTINGS",
          entityId: ctx.user.churchId,
          entityLabel: "Așezarea în pagină a documentelor",
          action: "UPDATE",
          fields: ["asezare"],
          before: { asezare: layoutSummary(church.docLayout) },
          after: { asezare: layoutSummary(layout) },
        });
      });
      revalidatePath("/documente", "layout");
      return { ok: true, message: "Așezarea a fost salvată ca implicită pentru documentele fără așezare proprie." };
    }

    const before = layoutSummary(storedLayout(doc.layout, church.docLayout));
    const layout = scop === "resetare" ? null : parseOrThrow(pageLayoutSchema, pageLayoutInput(formData));
    await ctx.db.$transaction(async (tx) => {
      await tx.document.update({ where: { id: documentId }, data: { layout: layout ?? Prisma.DbNull } });
      await writeAudit(tx, ctx.user, {
        entity: "DOCUMENT",
        entityId: documentId,
        entityLabel: label,
        action: "UPDATE",
        fields: ["asezare"],
        before: { asezare: before },
        after: { asezare: layout ? layoutSummary(layout) : `implicită (${layoutSummary(church.docLayout)})` },
      });
    });
    revalidatePath(`/documente/${documentId}`, "layout");
    return { ok: true, message: layout ? "Așezarea în pagină a fost salvată pentru acest document." : "Documentul folosește din nou așezarea implicită." };
  });
}
